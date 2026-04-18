import { z } from 'zod'

import {
  actionBeatSchema,
  audioBeatSchema,
  cinematicBackdropRoleSchema,
  cinematicCreativeTreatmentSchema,
  cinematicHookFamilySchema,
  cinematicNarrationModeSchema,
  dialogueBeatSchema,
} from './cinematics.ts'
import { cinematicPlanSchema, type CinematicPlan, type CinematicShotPlan } from './worldBuild.ts'

const CREATIVE_SCRIPT_FIELDS = [
  'PURPOSE',
  'ON_SCREEN',
  'ACTION',
  'DIALOGUE_OR_VO',
  'DIALOGUE',
  'CAMERA',
  'AUDIO',
  'NOTES',
] as const

type CreativeScriptField = (typeof CREATIVE_SCRIPT_FIELDS)[number]

export const cinematicCreativeScriptAuthorshipRawSchema = z.object({
  rawScriptMarkdown: z.preprocess((value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value
        .filter((entry): entry is string => typeof entry === 'string')
        .join('\n')
    }
    return ''
  }, z.string().default('')),
  diagnostics: z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)
    }
    if (typeof value === 'string') {
      return value.split('\n').map((entry) => entry.trim()).filter(Boolean)
    }
    if (value && typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>).map(([key, entry]) => `${key}: ${String(entry)}`)
    }
    return []
  }, z.array(z.string()).default([])),
  assistantNotes: z.preprocess((value) => {
    if (typeof value === 'string') return value
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string').join('\n')
    }
    if (value && typeof value === 'object') return JSON.stringify(value)
    return undefined
  }, z.string().optional()),
})

export const cinematicCreativeScriptBlockSchema = z.object({
  shotId: z.string(),
  sceneTitle: z.string().default(''),
  purpose: z.string().default(''),
  onScreen: z.string().default(''),
  dialogueOrVo: z.string().default(''),
  camera: z.string().default(''),
  audio: z.string().default(''),
  notes: z.string().default(''),
})

export const cinematicCreativeScriptIngestedShotSchema = z.object({
  id: z.string(),
  beat: z.string().default(''),
  framing: z.string().default(''),
  cameraAngle: z.string().default(''),
  cameraMovement: z.string().default(''),
  lensPreference: z.string().default(''),
  visualPrompt: z.string().default(''),
  compositionGuide: z.string().default(''),
  creativeTreatment: cinematicCreativeTreatmentSchema.nullable().default(null),
  hookFamily: cinematicHookFamilySchema.nullable().default(null),
  narrationMode: cinematicNarrationModeSchema.nullable().default(null),
  backdropRole: cinematicBackdropRoleSchema.nullable().default(null),
  backdropStrategy: z.string().default(''),
  dialogue: z.array(dialogueBeatSchema).default([]),
  actions: z.array(actionBeatSchema).default([]),
  audio: z.array(audioBeatSchema).default([]),
})

function appendFieldValue(currentValue: string, nextValue: string) {
  const trimmed = nextValue.trim()
  if (!trimmed) return currentValue
  return currentValue ? `${currentValue}\n${trimmed}` : trimmed
}

function splitCreativeTextIntoLines(value: string) {
  return value
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean)
}

function normalizeDialogueLine(value: string) {
  return value.replace(/^["']+|["']+$/g, '').trim()
}

function parseDialogueLine(value: string) {
  const trimmed = normalizeDialogueLine(value)
  if (!trimmed) return { speakerLabel: '', line: '' }
  const speakerMatch = trimmed.match(/^([^:]{1,80}):\s+(.+)$/)
  if (!speakerMatch) {
    return {
      speakerLabel: '',
      line: trimmed,
    }
  }
  return {
    speakerLabel: speakerMatch[1].trim(),
    line: speakerMatch[2].trim(),
  }
}

function inferFramingFromCamera(camera: string, fallback: string) {
  const source = `${camera} ${fallback}`.trim()
  const lower = source.toLowerCase()
  const matches = [
    'extreme close-up',
    'tight close-up',
    'medium close-up',
    'close-up',
    'medium shot',
    'wide shot',
    'insert shot',
    'insert',
    'selfie close-up',
    'selfie',
    'overhead',
    'top-down',
  ]
  const matched = matches.find((entry) => lower.includes(entry))
  return matched ?? ''
}

function inferCameraAngle(camera: string) {
  const lower = camera.toLowerCase()
  if (lower.includes('eye-level')) return 'eye-level'
  if (lower.includes('top-down')) return 'top-down'
  if (lower.includes('overhead')) return 'overhead'
  if (lower.includes('low angle')) return 'low angle'
  if (lower.includes('high angle')) return 'high angle'
  if (lower.includes('front-facing')) return 'front-facing'
  if (lower.includes('side angle')) return 'side angle'
  if (lower.includes('three-quarter')) return 'three-quarter'
  return ''
}

function inferCameraMovement(camera: string) {
  const lower = camera.toLowerCase()
  if (lower.includes('handheld')) return camera.trim()
  if (lower.includes('push-in')) return 'push-in'
  if (lower.includes('pull-back')) return 'pull-back'
  if (lower.includes('locked')) return 'locked-off'
  if (lower.includes('static')) return 'static'
  if (lower.includes('pan')) return 'pan'
  if (lower.includes('tilt')) return 'tilt'
  if (lower.includes('tracking')) return 'tracking'
  if (lower.includes('drift')) return 'drift'
  return camera.trim()
}

function inferLensPreference(camera: string, fallback: string) {
  const lower = `${camera} ${fallback}`.toLowerCase()
  if (lower.includes('selfie')) return 'front-facing smartphone selfie lens'
  if (lower.includes('phone') || lower.includes('smartphone')) return 'smartphone-native lens'
  if (lower.includes('wide')) return 'wide lens'
  if (lower.includes('close insert') || lower.includes('insert')) return 'smartphone close insert'
  return ''
}

export function parseCinematicCreativeScriptMarkdown(input: {
  markdown: string
  plannedShots: Array<Pick<CinematicShotPlan, 'id'>>
}) {
  const diagnostics: string[] = []
  const plannedShotIds = new Set(input.plannedShots.map((shot) => shot.id))
  const markdown = input.markdown.replace(/\r\n/g, '\n').trim()

  if (!markdown) {
    return {
      diagnostics: ['Creative script output was empty.'],
      blocks: [] as Array<z.infer<typeof cinematicCreativeScriptBlockSchema>>,
    }
  }

  const blocks: Array<z.infer<typeof cinematicCreativeScriptBlockSchema>> = []
  let currentBlock: z.infer<typeof cinematicCreativeScriptBlockSchema> | null = null
  let currentField: CreativeScriptField | null = null
  let currentSceneTitle = ''

  const flushCurrentBlock = () => {
    if (!currentBlock) return
    blocks.push(cinematicCreativeScriptBlockSchema.parse(currentBlock))
    currentBlock = null
    currentField = null
  }

  for (const rawLine of markdown.split('\n')) {
    const trimmed = rawLine.trim()
    if (!trimmed) {
      currentField = currentField === 'DIALOGUE_OR_VO' || currentField === 'AUDIO' ? currentField : null
      continue
    }

    const shotHeading = trimmed.match(/^##\s*SHOT\b\s*[:\-]?\s*(.+)$/i)
    if (shotHeading) {
      flushCurrentBlock()
      const shotId = shotHeading[1].trim()
      currentBlock = {
        shotId,
        sceneTitle: currentSceneTitle,
        purpose: '',
        onScreen: '',
        dialogueOrVo: '',
        camera: '',
        audio: '',
        notes: '',
      }
      if (!plannedShotIds.has(shotId)) {
        diagnostics.push(`Creative script referenced unknown shot id "${shotId}".`)
      }
      continue
    }

    const sceneHeading = trimmed.match(/^#\s*SCENE\b\s*[:\-]?\s*(.+)$/i)
    if (sceneHeading) {
      currentSceneTitle = sceneHeading[1].trim()
      currentField = null
      continue
    }

    const fieldMatch = trimmed.match(/^(PURPOSE|ON_SCREEN|ACTION|DIALOGUE_OR_VO|DIALOGUE|CAMERA|AUDIO|NOTES):\s*(.*)$/i)
    if (fieldMatch && currentBlock) {
      currentField = fieldMatch[1].toUpperCase() as CreativeScriptField
      const inlineValue = fieldMatch[2].trim()
      if (currentField === 'PURPOSE') currentBlock.purpose = appendFieldValue(currentBlock.purpose, inlineValue)
      if (currentField === 'ON_SCREEN' || currentField === 'ACTION') currentBlock.onScreen = appendFieldValue(currentBlock.onScreen, inlineValue)
      if (currentField === 'DIALOGUE_OR_VO' || currentField === 'DIALOGUE') currentBlock.dialogueOrVo = appendFieldValue(currentBlock.dialogueOrVo, inlineValue)
      if (currentField === 'CAMERA') currentBlock.camera = appendFieldValue(currentBlock.camera, inlineValue)
      if (currentField === 'AUDIO') currentBlock.audio = appendFieldValue(currentBlock.audio, inlineValue)
      if (currentField === 'NOTES') currentBlock.notes = appendFieldValue(currentBlock.notes, inlineValue)
      continue
    }

    if (!currentBlock || !currentField) continue

    if (currentField === 'PURPOSE') currentBlock.purpose = appendFieldValue(currentBlock.purpose, trimmed)
    if (currentField === 'ON_SCREEN' || currentField === 'ACTION') currentBlock.onScreen = appendFieldValue(currentBlock.onScreen, trimmed)
    if (currentField === 'DIALOGUE_OR_VO' || currentField === 'DIALOGUE') currentBlock.dialogueOrVo = appendFieldValue(currentBlock.dialogueOrVo, trimmed)
    if (currentField === 'CAMERA') currentBlock.camera = appendFieldValue(currentBlock.camera, trimmed)
    if (currentField === 'AUDIO') currentBlock.audio = appendFieldValue(currentBlock.audio, trimmed)
    if (currentField === 'NOTES') currentBlock.notes = appendFieldValue(currentBlock.notes, trimmed)
  }

  flushCurrentBlock()

  const uniqueBlocks: Array<z.infer<typeof cinematicCreativeScriptBlockSchema>> = []
  const seenShotIds = new Set<string>()
  for (const block of blocks) {
    if (seenShotIds.has(block.shotId)) {
      diagnostics.push(`Creative script included duplicate shot id "${block.shotId}". Keeping the first block only.`)
      continue
    }
    seenShotIds.add(block.shotId)
    uniqueBlocks.push(block)
  }

  for (const plannedShot of input.plannedShots) {
    if (!seenShotIds.has(plannedShot.id)) {
      diagnostics.push(`Creative script did not include a block for planned shot "${plannedShot.id}".`)
    }
  }

  return {
    diagnostics: Array.from(new Set(diagnostics)),
    blocks: uniqueBlocks,
  }
}

function buildDialogueBeats(input: {
  shot: CinematicShotPlan
  dialogueText: string
}) {
  const lines = splitCreativeTextIntoLines(input.dialogueText)
  if (lines.length === 0) return [] as z.infer<typeof dialogueBeatSchema>[]
  const defaultSpeakerRefId = input.shot.participantRefIds.length === 1 ? input.shot.participantRefIds[0] : null
  return lines
    .map((line, index) => {
      const parsedLine = parseDialogueLine(line)
      if (!parsedLine.line) return null
      return {
        id: `${input.shot.id}_dialogue_${index + 1}`,
        speakerRefId: defaultSpeakerRefId,
        line: parsedLine.line,
        delivery: parsedLine.speakerLabel,
        startSeconds: null,
        endSeconds: null,
        lipSync: true,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
}

function buildVoiceoverAudioBeats(input: {
  shot: CinematicShotPlan
  voiceoverText: string
}) {
  const lines = splitCreativeTextIntoLines(input.voiceoverText)
  return lines.map((line, index) => ({
    id: `${input.shot.id}_audio_vo_${index + 1}`,
    kind: 'ambience' as const,
    cue: normalizeDialogueLine(line),
    sourceRefId: null,
    startSeconds: null,
    endSeconds: null,
  }))
}

function buildAudioBeats(input: {
  shot: CinematicShotPlan
  audioText: string
}) {
  const lines = splitCreativeTextIntoLines(input.audioText)
  return lines.map((line, index) => ({
    id: `${input.shot.id}_audio_${index + 1}`,
    kind: 'ambience' as const,
    cue: line,
    sourceRefId: null,
    startSeconds: null,
    endSeconds: null,
  }))
}

function buildActionBeats(input: {
  shot: CinematicShotPlan
  onScreenText: string
}) {
  const lines = splitCreativeTextIntoLines(input.onScreenText)
  const actionLines = lines.length > 0 ? lines : [input.shot.beat].filter(Boolean)
  const defaultActorRefId = input.shot.participantRefIds.length === 1 ? input.shot.participantRefIds[0] : null
  return actionLines.map((line, index) => ({
    id: `${input.shot.id}_action_${index + 1}`,
    actorRefId: defaultActorRefId,
    targetRefId: null,
    verb: line,
    propRefId: input.shot.propRefIds[0] ?? null,
    stagingNotes: '',
    startSeconds: null,
    endSeconds: null,
  }))
}

export function ingestCinematicCreativeScriptToAuthoredShots(input: {
  plan: CinematicPlan
  rawScriptMarkdown: string
}) {
  const plan = cinematicPlanSchema.parse(input.plan)
  const parsed = parseCinematicCreativeScriptMarkdown({
    markdown: input.rawScriptMarkdown,
    plannedShots: plan.shots.map((shot) => ({ id: shot.id })),
  })
  const blockByShotId = new Map(parsed.blocks.map((block) => [block.shotId, block]))
  const diagnostics = [...parsed.diagnostics]

  const authoredShots = plan.shots.map((shot) => {
    const block = blockByShotId.get(shot.id)
    const beat = block?.onScreen.trim() || shot.beat || block?.purpose.trim() || ''
    const camera = block?.camera.trim() || ''
    const notes = block?.notes.trim() || ''
    const purpose = block?.purpose.trim() || ''
    const dialogueOrVo = block?.dialogueOrVo.trim() || ''
    const explicitAudio = block?.audio.trim() || ''
    const communicationMode = shot.narrationMode ?? plan.graphSettings.narrationMode ?? null

    const spokenDialogue =
      communicationMode === 'spoken_over_footage' || communicationMode === 'visual_only'
        ? []
        : buildDialogueBeats({ shot, dialogueText: dialogueOrVo })
    const voiceoverAudio =
      communicationMode === 'spoken_over_footage' || communicationMode === 'visual_only'
        ? buildVoiceoverAudioBeats({ shot, voiceoverText: dialogueOrVo })
        : []
    const audio = [...voiceoverAudio, ...buildAudioBeats({ shot, audioText: explicitAudio })]
    const actions = buildActionBeats({ shot, onScreenText: block?.onScreen ?? '' })

    if (!block) {
      diagnostics.push(`Ingestor used the planned skeleton for missing creative-script shot "${shot.id}".`)
    }

    return cinematicCreativeScriptIngestedShotSchema.parse({
      id: shot.id,
      beat,
      framing: inferFramingFromCamera(camera, beat) || shot.framing || '',
      cameraAngle: inferCameraAngle(camera) || shot.cameraAngle || '',
      cameraMovement: inferCameraMovement(camera) || shot.cameraMovement || '',
      lensPreference: inferLensPreference(camera, beat) || shot.lensPreference || '',
      visualPrompt: [beat, camera].filter(Boolean).join(' ').trim(),
      compositionGuide: [purpose, notes].filter(Boolean).join(' ').trim(),
      creativeTreatment: shot.creativeTreatment ?? plan.graphSettings.creativeTreatment ?? null,
      hookFamily: shot.hookFamily ?? plan.graphSettings.hookFamily ?? null,
      narrationMode: shot.narrationMode ?? plan.graphSettings.narrationMode ?? null,
      backdropRole: shot.backdropRole ?? plan.graphSettings.backdropRole ?? null,
      backdropStrategy: shot.backdropStrategy || plan.graphSettings.backdropStrategy || '',
      dialogue: spokenDialogue,
      actions,
      audio,
    })
  })

  return {
    diagnostics: Array.from(new Set(diagnostics)),
    blocks: parsed.blocks,
    authoredShots,
  }
}
