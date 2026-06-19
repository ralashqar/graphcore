import { z } from 'zod'
import {
  normalizeSequenceAnimaticContinuityPlan,
  sequenceAnimaticContinuityPlanV2Schema,
  sequenceAnimaticPlanFromContinuityGraphV2,
} from './output-workflow-sequence-animatic-continuity-graph-runtime.ts'
import {
  buildSequenceAnimaticContinuityPlannerContext,
} from './output-workflow-sequence-animatic-reference-runtime.ts'

type LooseRecord = Record<string, unknown>

type BackgroundStructuredNodeProgress = {
  providerRequestId?: string | null
  providerStatus?: string | null
  providerMode?: string | null
  lastProviderPollAt?: string | null
  providerStartedAt?: string | null
  providerIncompleteReason?: string | null
  providerIncompleteDetails?: LooseRecord | null
}

type BackgroundStructuredNodeResult<TValue> = {
  value: TValue
  providerRequestId?: string | null
  provider?: string | null
  model?: string | null
  fallbackUsed?: boolean
  fallbackReason?: string | null
}

type BackgroundStructuredNodeRunner = <TValue>(input: {
  nodeKey: string
  schemaName: string
  schema: z.ZodType<TValue>
  instructions: string
  prompt: string
  fallback: TValue
  maxOutputTokens: number
  priorProviderRequestId?: string | null
  providerStartedAt?: string | null
  timeoutMs?: number
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: BackgroundStructuredNodeProgress) => Promise<void>
}) => Promise<BackgroundStructuredNodeResult<TValue>>

function asRecord(value: unknown): LooseRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as LooseRecord : {}
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function sequenceAnimaticAtlasLayout(count: number) {
  const panelCount = Math.max(0, Math.min(9, Math.ceil(count)))
  if (panelCount <= 0) return { rows: 0, columns: 0, panelCount: 0 }
  if (panelCount === 1) return { rows: 1, columns: 1, panelCount }
  if (panelCount === 2) return { rows: 1, columns: 2, panelCount }
  if (panelCount <= 4) return { rows: 2, columns: 2, panelCount }
  if (panelCount <= 6) return { rows: 2, columns: 3, panelCount }
  return { rows: 3, columns: 3, panelCount }
}

export function sequenceAnimaticAtlasImageSize(layout: { rows: number; columns: number }) {
  if (layout.rows <= 0 || layout.columns <= 0) return { width: 1024, height: 1024 }
  return {
    width: Math.max(1024, Math.min(3072, layout.columns * 768)),
    height: Math.max(1024, Math.min(3072, layout.rows * 768)),
  }
}

export function buildSequenceAnimaticContinuityAnchorPlannerPrompt(input: {
  prompt?: string | null
  continuityPlannerContext: LooseRecord
  compactForPrompt: (value: unknown, maxLength?: number) => string
}) {
  return [
    'Plan output-local continuity references for a screenplay animatic.',
    'Use the compact planner context as the truth source; infer from shot action, camera, dialogue, resolved refs, and block membership rather than full screenplay prose.',
    'Treat existingWorldReferences and every shot.resolvedRefs entry as canonical world entities. Never recreate those characters, locations, props, aliases, or keys as sidecar anchors.',
    'Persist only visual physical assets that need continuity and do not already have a world/entity reference.',
    'Accept: incidental speakers without world entities, recurring or story-critical props, set pieces, rooms, sub-locations, and persistent camera angles.',
    'Also accept specific visible one-shot incidental characters when they have a concrete role/species/identity cue, such as a vole mechanic, guard, courier, attendant, or shopkeeper; reject only generic crowds/background figures.',
    'For props, use shot.description as the primary evidence. Accept a prop only when it appears in at least two shots and is the subject of action, diagnosis, gaze, manipulation, comparison, or character interaction. Reject background-only objects even if named.',
    'Audit every shot.description for physical object candidates. Every named object, mechanism, door/hatch, gauge, clock part, tube, valve, lever, clamp, tool, panel, note, map, or set-piece that appears in two or more shots must appear either in anchors or rejectedCandidates; do not silently omit it.',
    'If a repeated physical object is better represented as a set-piece/spot/zone than a prop, create the appropriate location/spot structure and still include a rejectedCandidates entry explaining why it is not a prop anchor.',
    'Reject atmosphere/effects/abstracts/non-assets: rain, fog, mist, smoke, tension, silence, ambience, mood, danger, lighting/color-only cues, music, generic motion.',
    'Reject existing world entities by key/name/alias. If a shot uses an existing character/location/prop, do not create a sidecar anchor for it; include existingWorldEntityMatch on the rejected candidate.',
    'Unresolved shot refs are diagnostics, not permission to duplicate canon. Only create an anchor from unresolved prose when the shot clearly describes a missing temporary physical visual asset.',
    'For locations, infer locationSets and locationAngles. Build sceneGraph edges for connected_to, visible_from, entrance_to, adjacent_to, or same_space_angle.',
    'Use stable IDs: char_*, prop_*, set_*, angle_* or spot_*. Group aliases across shots into one anchor.',
    'Every accepted anchor needs a persistenceReason, confidence 0-1, shotIds, storyboardBlockIds, sourceEvidence, existingWorldEntityMatch null unless rejected, and rejectionRisk.',
    'Put rejected candidates and the reason in rejectedCandidates.',
    readText(input.prompt) ? `User brief:\n${readText(input.prompt)}` : '',
    input.compactForPrompt({ continuityPlannerContext: input.continuityPlannerContext }, 16_000),
  ].filter(Boolean).join('\n\n')
}

export async function planSequenceAnimaticContinuityAnchorsRuntime(input: {
  nodeKey: string
  prompt?: string | null
  screenplayDraft: LooseRecord
  shotPlan: LooseRecord
  shotBreakPlan: LooseRecord
  assetPack: LooseRecord
  continuityPlannerContext?: LooseRecord
  continuityGraphV2?: LooseRecord
  priorProviderRequestId?: string | null
  priorProviderStartedAt?: string | null
  timeoutMs?: number
  shouldCancel?: () => Promise<boolean>
  onProgress?: (progress: BackgroundStructuredNodeProgress) => Promise<void>
  compactForPrompt: (value: unknown, maxLength?: number) => string
  runBackgroundStructuredNode: BackgroundStructuredNodeRunner
}) {
  const providedContinuityGraphV2 = asRecord(input.continuityGraphV2)
  if (Object.keys(providedContinuityGraphV2).length > 0) {
    return sequenceAnimaticPlanFromContinuityGraphV2(providedContinuityGraphV2)
  }
  const emptyPlan = sequenceAnimaticContinuityPlanV2Schema.parse({
    version: 'sequence_animatic_continuity_plan_v2',
    planningMode: 'llm_structured_v2',
    anchors: [],
    rejectedCandidates: [],
    warnings: [],
    diagnostics: [],
  })
  const providedPlannerContext = asRecord(input.continuityPlannerContext)
  const continuityPlannerContext = Object.keys(providedPlannerContext).length > 0
    ? providedPlannerContext
    : buildSequenceAnimaticContinuityPlannerContext({
      screenplayDraft: input.screenplayDraft,
      shotPlan: input.shotPlan,
      shotBreakPlan: input.shotBreakPlan,
      assetPack: input.assetPack,
      animaticReferenceCatalog: input.screenplayDraft.animaticReferenceCatalog,
    })
  const continuityPrompt = buildSequenceAnimaticContinuityAnchorPlannerPrompt({
    prompt: input.prompt,
    continuityPlannerContext,
    compactForPrompt: input.compactForPrompt,
  })
  let result: BackgroundStructuredNodeResult<z.infer<typeof sequenceAnimaticContinuityPlanV2Schema>>
  try {
    result = await input.runBackgroundStructuredNode({
      nodeKey: input.nodeKey,
      schemaName: 'sequence_animatic_continuity_plan_v2',
      schema: sequenceAnimaticContinuityPlanV2Schema,
      instructions: 'You are a film continuity supervisor. Return strict JSON only. Infer only physical, drawable, reusable sidecar continuity assets from parsed shots.',
      prompt: continuityPrompt,
      fallback: emptyPlan,
      maxOutputTokens: 5200,
      priorProviderRequestId: input.priorProviderRequestId,
      providerStartedAt: input.priorProviderStartedAt,
      timeoutMs: input.timeoutMs,
      shouldCancel: input.shouldCancel,
      onProgress: input.onProgress,
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Background continuity planner failed.'
    throw new Error(`LLM continuity planner failed and deterministic fallback is disabled: ${reason}`)
  }
  if (result.fallbackUsed) {
    throw new Error(`LLM continuity planner returned fallback output and deterministic fallback is disabled: ${result.fallbackReason || 'structured output unavailable'}`)
  }
  const normalizedPlan = normalizeSequenceAnimaticContinuityPlan({
    rawPlan: result.value,
    fallbackPlan: emptyPlan,
    shotPlan: input.shotPlan,
    shotBreakPlan: input.shotBreakPlan,
    assetPack: input.assetPack,
    fallbackUsed: Boolean(result.fallbackUsed),
    fallbackReason: result.fallbackReason ?? undefined,
  })
  return {
    ...normalizedPlan,
    providerRequestId: result.providerRequestId || readText(input.priorProviderRequestId) || null,
    plannerProvider: result.provider,
    plannerModel: result.model,
    plannerFallbackReason: result.fallbackReason,
  }
}
