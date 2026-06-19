import { z } from 'zod'

import { cinematicV2ShotSchema, providerSafeCinematicV2DurationSeconds } from '../../../src/domain/cinematics.ts'

type LooseRecord = Record<string, unknown>

export const sequenceAnimaticShotRevisionPlanSchema = z.object({
  revisedShot: cinematicV2ShotSchema,
  changeSummary: z.string().max(800).default(''),
  keyframeIntent: z.string().max(900).default(''),
  diagnostics: z.array(z.string().max(400)).default([]),
})

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(readText).filter(Boolean)
}

export function deterministicShotRevisionPlan(input: {
  shot: LooseRecord
  revisionPrompt: string
}) {
  const base = cinematicV2ShotSchema.parse({
    ...input.shot,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(input.shot.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(input.shot.editorialDurationSeconds ?? 0) || 3),
  })
  const prompt = readText(input.revisionPrompt)
  const revisedShot = cinematicV2ShotSchema.parse({
    ...base,
    action: [base.action, prompt ? `Revision direction: ${prompt}` : ''].filter(Boolean).join(' '),
    storyboardPanelPrompt: [
      readText(base.storyboardPanelPrompt) || base.action || base.description || base.title,
      prompt ? `Apply this user revision visibly: ${prompt}` : '',
    ].filter(Boolean).join(' '),
    videoDirection: [
      readText(base.videoDirection),
      prompt ? `Apply the revised staging/keyframe intent: ${prompt}` : '',
    ].filter(Boolean).join(' '),
  })
  return sequenceAnimaticShotRevisionPlanSchema.parse({
    revisedShot,
    changeSummary: prompt ? `Applied requested shot revision: ${prompt}` : 'No revision prompt supplied; preserved the original shot.',
    keyframeIntent: prompt,
    diagnostics: ['Deterministic shot revision fallback used.'],
  })
}

export async function planSequenceAnimaticShotRevisionRuntime(input: {
  nodeKey: string
  shot: LooseRecord
  revisionPrompt: string
  assetPack: LooseRecord
  baseKeyframe: LooseRecord
  priorProviderRequestId?: string | null
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: {
    providerRequestId: string
    providerStatus: string
    providerMode: string
    lastProviderPollAt: string
    providerStartedAt?: string
  }) => Promise<void>
  runBackgroundStructuredNode: <TValue>(input: {
    nodeKey: string
    schemaName: string
    schema: z.ZodType<TValue>
    instructions: string
    prompt: string
    fallback: TValue
    maxOutputTokens?: number
    priorProviderRequestId?: string | null
    providerStartedAt?: string | null
    timeoutMs?: number
    shouldCancel?: () => Promise<boolean>
    onProgress?: (progress: {
      providerRequestId: string
      providerStatus: string
      providerMode: string
      providerStartedAt?: string
      lastProviderPollAt: string
    }) => Promise<void>
  }) => Promise<{
    value: TValue
    provider: string
    model: string
    providerRequestId: string
    fallbackUsed: boolean
    fallbackReason: string
  }>
}) {
  const fallback = deterministicShotRevisionPlan(input)
  const shot = cinematicV2ShotSchema.parse({
    ...input.shot,
    editorialDurationSeconds: Math.max(0.5, Math.min(15, Number(input.shot.editorialDurationSeconds ?? 0) || 3)),
    providerDurationSeconds: providerSafeCinematicV2DurationSeconds(Number(input.shot.editorialDurationSeconds ?? 0) || 3),
  })
  const assetEntities = readArray(input.assetPack.entities).map(asRecord).map((entity) => ({
    key: readText(entity.key),
    name: readText(entity.name),
    type: readText(entity.type),
    summary: readText(entity.summary),
    visualDescription: readText(entity.visualDescription),
    selectedReferenceAssetKey: readText(entity.selectedReferenceAssetKey) || readStringArray(entity.assetKeys)[0] || '',
    continuityAnchor: entity.continuityAnchor === true,
  })).filter((entry) => entry.key || entry.name)
  const prompt = [
    'Revise exactly one sequence animatic shot from a user prompt.',
    'Return a complete revised shot object, not a patch. Preserve the same id, index, duration fields, visible/speaker/location/prop refs, continuity ids, and dialogue unless the user explicitly asks to change them.',
    'The revision is output-local; do not mutate world canon. Make the shot internally coherent for a new single keyframe.',
    'Keep the result compact and drawable. If the user asks for camera or lighting changes, update camera, lighting, action, storyboardPanelPrompt, and videoDirection as needed.',
    '',
    `User revision prompt: ${readText(input.revisionPrompt)}`,
    '',
    `Base shot JSON:\n${JSON.stringify(shot, null, 2)}`,
    '',
    `Available canonical/continuity references:\n${JSON.stringify(assetEntities.slice(0, 16), null, 2)}`,
    '',
    `Base keyframe asset key: ${readText(input.baseKeyframe.assetKey)}`,
  ].join('\n')
  const result = await input.runBackgroundStructuredNode({
    nodeKey: input.nodeKey,
    schemaName: 'sequence_animatic_shot_revision_plan_v1',
    schema: sequenceAnimaticShotRevisionPlanSchema,
    instructions: 'You are a senior storyboard director revising one parsed animatic shot. Return strict JSON only.',
    prompt,
    fallback,
    maxOutputTokens: 2400,
    priorProviderRequestId: input.priorProviderRequestId,
    shouldCancel: input.shouldCancel,
    onProgress: input.onProgress,
  })
  const value = sequenceAnimaticShotRevisionPlanSchema.parse(result.value)
  return {
    ...value,
    revisedShot: cinematicV2ShotSchema.parse({
      ...value.revisedShot,
      id: shot.id,
      index: shot.index,
      editorialDurationSeconds: shot.editorialDurationSeconds,
      providerDurationSeconds: shot.providerDurationSeconds,
    }),
    provider: result.provider,
    model: result.model,
    providerRequestId: result.providerRequestId,
    fallbackUsed: result.fallbackUsed,
    fallbackReason: result.fallbackReason,
  }
}
