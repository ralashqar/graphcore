import { z } from 'zod'
import type { ProjectSnapshot } from './graphcore.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const vibeDirectorPhaseSchema = z.enum([
  'world_target_selection',
  'premise_intake',
  'style_lock',
  'directing_style_lock',
  'brand_atlas_review',
  'reference_build',
  'sequence_unit_review',
  'output_path_choice',
  'comic_review',
  'comic_generation',
  'cinematic_screenplay_review',
  'cinematic_shot_plan_review',
  'cinematic_storyboard_generation',
  'cinematic_keyframe_generation',
  'output_review',
])

export const vibeDirectorQualityGateStatusSchema = z.enum([
  'pending',
  'running',
  'passed',
  'fixed',
  'needs_user_choice',
  'overridden',
])

export const vibeDirectorMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['agent', 'user', 'system']),
  text: z.string(),
  createdAt: z.string(),
  phase: vibeDirectorPhaseSchema,
})

export const vibeDirectorQualityGateSchema = z.object({
  id: z.string(),
  label: z.string(),
  target: z.string(),
  status: vibeDirectorQualityGateStatusSchema,
  findings: z.array(z.string()).default([]),
  fixSummary: z.string().default(''),
})

export const vibeDirectorOutputPathSchema = z.enum(['undecided', 'comic', 'cinematic', 'both'])
export const vibeDirectorModeSchema = z.enum([
  'empty_world_seed',
  'existing_sequence',
  'new_sequence_in_world',
  'custom_world_cinematic',
  'custom_world_comic',
  'continue_output',
])
export const vibeDirectorCanonModeSchema = z.enum(['canon_scene', 'output_only'])
export const vibeDirectorDirectingStylePresetSchema = z.enum([
  'classical_continuity',
  'handheld_realism',
  'slow_cinema',
  'anime_action',
  'noir_suspense',
  'precision_thriller',
  'romantic_melancholy',
  'mythic_epic',
])

export const vibeDirectorRecommendationSchema = z.object({
  id: z.string(),
  label: z.string(),
  rationale: z.string().default(''),
  actionKind: z.enum([
    'accept_premise',
    'select_existing_sequence',
    'start_new_world_scene',
    'start_custom_cinematic',
    'start_custom_comic',
    'continue_output',
    'lock_style',
    'lock_directing_style',
    'generate_atlas',
    'build_references',
    'queue_reference_sheets',
    'create_sequence',
    'choose_comic',
    'choose_cinematic',
    'choose_both',
    'start_comic',
    'start_cinematic',
    'continue_comic_to_cinematic',
    'prepare_storyboards',
    'prepare_keyframes',
    'apply_shot_direction',
    'prepare_continuity',
    'open_outputs',
    'open_wiki',
  ]),
  targetPhase: vibeDirectorPhaseSchema,
  payload: looseRecordSchema.default({}),
})

export const vibeShotRecommendationSchema = z.object({
  id: z.string(),
  targetType: z.enum(['scene', 'block', 'shot']).default('shot'),
  targetId: z.string().default(''),
  label: z.string(),
  rationale: z.string().default(''),
  camera: z.string().default(''),
  lensFraming: z.string().default(''),
  movement: z.string().default(''),
  editRhythm: z.string().default(''),
  performanceNote: z.string().default(''),
  continuityRationale: z.string().default(''),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
})

export const vibeContinuityInspectorSchema = z.object({
  shotId: z.string().default(''),
  readiness: z.enum(['ready', 'blocked', 'warning']).default('warning'),
  summary: z.string().default(''),
  characterRefs: z.array(z.string()).default([]),
  spatialRefs: z.array(z.string()).default([]),
  propRefs: z.array(z.string()).default([]),
  storyboardRefs: z.array(z.string()).default([]),
  previousVisualRefs: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  recommendedFixes: z.array(vibeDirectorRecommendationSchema).default([]),
})

export const vibeDirectorWorkflowBriefSchema = z.object({
  version: z.literal('vibe_director_workflow_brief_v1').default('vibe_director_workflow_brief_v1'),
  sourceSurface: z.literal('vibe_director').default('vibe_director'),
  artStyleDescription: z.string().default(''),
  comicPanelStyle: z.string().default(''),
  letteringStyle: z.string().default(''),
  palette: z.array(z.string()).default([]),
  directingStylePreset: vibeDirectorDirectingStylePresetSchema.default('classical_continuity'),
  directingStyle: z.string().default(''),
  coverageStyle: z.string().default(''),
  cameraLanguage: z.string().default(''),
  editingRhythm: z.string().default(''),
  performanceMode: z.string().default(''),
  moodEngine: z.string().default(''),
  avoidList: z.array(z.string()).default([]),
  outputPath: vibeDirectorOutputPathSchema.default('undecided'),
  qualityGateMode: z.enum(['standard', 'strict', 'off']).default('standard'),
  selectedComicReferenceArtifactKeys: z.array(z.string()).default([]),
  shotDirectingNotesByShotId: z.record(z.string(), z.string()).default({}),
  continuityPolicy: z.object({
    canonicalRefs: z.literal('identity_authority').default('identity_authority'),
    spatialRefs: z.literal('spatial_authority').default('spatial_authority'),
    previousKeyframes: z.literal('sequence_visual_continuity').default('sequence_visual_continuity'),
    storyboards: z.literal('composition_and_action_guidance').default('composition_and_action_guidance'),
    comicPages: z.literal('optional_action_composition_guidance_only').default('optional_action_composition_guidance_only'),
  }).default({
    canonicalRefs: 'identity_authority',
    spatialRefs: 'spatial_authority',
    previousKeyframes: 'sequence_visual_continuity',
    storyboards: 'composition_and_action_guidance',
    comicPages: 'optional_action_composition_guidance_only',
  }),
})

export const vibeDirectorQualityPassSchema = z.object({
  version: z.literal('vibe_director_quality_pass_v1').default('vibe_director_quality_pass_v1'),
  target: z.enum(['screenplay', 'scene_shot_plan', 'keyframe_prompt']).default('screenplay'),
  status: z.enum(['passed', 'warning', 'blocked']).default('warning'),
  score: z.number().min(0).max(1).default(0.75),
  findings: z.array(z.string()).default([]),
  fixesApplied: z.array(z.string()).default([]),
  recommendedActions: z.array(z.string()).default([]),
})

export const vibeDirectorShotDirectionSchema = z.object({
  version: z.literal('vibe_director_shot_direction_v1').default('vibe_director_shot_direction_v1'),
  shotId: z.string().default(''),
  note: z.string().default(''),
  camera: z.string().default(''),
  movement: z.string().default(''),
  performance: z.string().default(''),
  continuity: z.string().default(''),
  source: z.enum(['user', 'recommendation', 'workflow']).default('workflow'),
})

export const vibeDirectorContinuityReadinessSchema = z.object({
  version: z.literal('vibe_director_continuity_readiness_v1').default('vibe_director_continuity_readiness_v1'),
  shotId: z.string().default(''),
  status: z.enum(['ready', 'warning', 'blocked']).default('warning'),
  canonicalRefCount: z.number().int().nonnegative().default(0),
  spatialRefCount: z.number().int().nonnegative().default(0),
  previousVisualRefCount: z.number().int().nonnegative().default(0),
  storyboardRefCount: z.number().int().nonnegative().default(0),
  warnings: z.array(z.string()).default([]),
  referencePriority: z.array(z.string()).default([
    'canonical identity refs',
    'scene continuity and zone/spot refs',
    'storyboard panels',
    'previous keyframes',
    'comic pages as optional action/composition guidance',
  ]),
})

export const vibeDirectorSessionSchema = z.object({
  version: z.literal(3),
  phase: vibeDirectorPhaseSchema,
  mode: vibeDirectorModeSchema.default('empty_world_seed'),
  canonMode: vibeDirectorCanonModeSchema.default('canon_scene'),
  premise: z.string().default(''),
  premiseKind: z.enum(['unknown', 'nonsense', 'premise', 'script']).default('unknown'),
  stylePreset: z.string().default('cinematic_live_action'),
  artStyleDescription: z.string().default(''),
  directingStylePreset: vibeDirectorDirectingStylePresetSchema.default('classical_continuity'),
  directingStyleLocked: z.boolean().default(false),
  directingStyleDescription: z.string().default(''),
  coverageStyle: z.string().default('classical continuity coverage with clear geography and motivated shot progression'),
  cameraLanguage: z.string().default('controlled camera placement, readable blocking, varied shot scale'),
  editingRhythm: z.string().default('measured escalation with clean cause-and-effect cuts'),
  performanceMode: z.string().default('grounded performance with readable emotional turns'),
  moodEngine: z.string().default('cinematic tension shaped by character objective and location atmosphere'),
  directingAvoidList: z.array(z.string()).default([]),
  comicPanelStyle: z.string().default(''),
  letteringStyle: z.string().default(''),
  paletteMode: z.enum(['auto', 'manual']).default('auto'),
  palette: z.array(z.string()).default([]),
  lockedArtStyle: z.boolean().default(false),
  brandAtlasAssetKey: z.string().nullable().default(null),
  brandAtlasVisualJobId: z.string().nullable().default(null),
  selectedWorldTargetSequenceKey: z.string().nullable().default(null),
  selectedWorldReferenceEntityKeys: z.array(z.string()).default([]),
  selectedOutputRequestId: z.string().nullable().default(null),
  approvedReferenceEntityKeys: z.array(z.string()).default([]),
  selectedSequenceUnitKey: z.string().nullable().default(null),
  outputPath: vibeDirectorOutputPathSchema.default('undecided'),
  comicPageCount: z.number().int().min(1).max(12).default(8),
  comicContinuityMode: z.enum(['previous_page', 'parallel', 'selected_references']).default('previous_page'),
  qualityGateMode: z.enum(['standard', 'strict', 'off']).default('standard'),
  outputRequestId: z.string().nullable().default(null),
  comicOutputRequestId: z.string().nullable().default(null),
  cinematicMasterRequestId: z.string().nullable().default(null),
  screenplayApproved: z.boolean().default(false),
  shotPlanApproved: z.boolean().default(false),
  storyboardApproved: z.boolean().default(false),
  selectedCinematicShotIds: z.array(z.string()).default([]),
  selectedComicReferenceArtifactKeys: z.array(z.string()).default([]),
  directingNotes: z.record(z.string(), z.string()).default({}),
  shotDirectingNotesByShotId: z.record(z.string(), z.string()).default({}),
  appliedShotRecommendationIds: z.array(z.string()).default([]),
  continuityInspectorDismissedWarnings: z.array(z.string()).default([]),
  recommendedActions: z.array(vibeDirectorRecommendationSchema).default([]),
  messages: z.array(vibeDirectorMessageSchema).default([]),
  qualityGates: z.array(vibeDirectorQualityGateSchema).default([]),
  metadata: looseRecordSchema.default({}),
  updatedAt: z.string(),
})

export type VibeDirectorPhase = z.infer<typeof vibeDirectorPhaseSchema>
export type VibeDirectorSession = z.infer<typeof vibeDirectorSessionSchema>
export type VibeDirectorMode = z.infer<typeof vibeDirectorModeSchema>
export type VibeDirectorCanonMode = z.infer<typeof vibeDirectorCanonModeSchema>
export type VibeDirectorQualityGate = z.infer<typeof vibeDirectorQualityGateSchema>
export type VibeDirectorRecommendation = z.infer<typeof vibeDirectorRecommendationSchema>
export type VibeDirectorOutputPath = z.infer<typeof vibeDirectorOutputPathSchema>
export type VibeDirectorDirectingStylePreset = z.infer<typeof vibeDirectorDirectingStylePresetSchema>
export type VibeShotRecommendation = z.infer<typeof vibeShotRecommendationSchema>
export type VibeContinuityInspector = z.infer<typeof vibeContinuityInspectorSchema>
export type VibeDirectorWorkflowBrief = z.infer<typeof vibeDirectorWorkflowBriefSchema>
export type VibeDirectorQualityPass = z.infer<typeof vibeDirectorQualityPassSchema>
export type VibeDirectorShotDirection = z.infer<typeof vibeDirectorShotDirectionSchema>
export type VibeDirectorContinuityReadiness = z.infer<typeof vibeDirectorContinuityReadinessSchema>

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function compactEntityLabel(entity: Pick<ProjectSnapshot['worldEntities'][number], 'key' | 'name' | 'nodeType' | 'summary'>) {
  return `${entity.name || entity.key} (${entity.nodeType})${entity.summary ? `: ${entity.summary}` : ''}`
}

export function buildVibeWorldStateSummary(snapshot: Pick<ProjectSnapshot, 'project' | 'draft' | 'worldEntities' | 'outputRequests'>) {
  const worldWiki = readRecord(readRecord(snapshot.draft.metadata).worldWiki)
  const activeEntities = snapshot.worldEntities.filter((entity) => entity.status !== 'archived')
  const sequenceUnits = activeEntities.filter((entity) => entity.nodeType === 'sequence_unit')
  const referenceEntities = activeEntities.filter((entity) => entity.nodeType !== 'sequence_unit' && entity.nodeType !== 'concept')
  const comicOutputs = snapshot.outputRequests.filter((request) => request.outputKind === 'comic_issue_from_sequence')
  const cinematicOutputs = snapshot.outputRequests.filter((request) => request.outputKind === 'cinematic_episode')
  const artStyleDescription = readString(worldWiki.artStyleDescription)
  const brandAtlasAssetKey = readString(worldWiki.brandAtlasAssetKey)
  const title = readString(worldWiki.title) || snapshot.project.name
  const logline = readString(worldWiki.logline) || snapshot.project.summary
  const synopsis = readString(worldWiki.synopsis)
  const palette = Array.isArray(worldWiki.palette)
    ? worldWiki.palette.map(readString).filter(Boolean)
    : []

  return {
    populated: activeEntities.length > 0,
    title,
    logline,
    synopsis,
    artStyleDescription,
    brandAtlasAssetKey,
    palette,
    hasWorldStyle: Boolean(artStyleDescription || brandAtlasAssetKey),
    activeEntityCount: activeEntities.length,
    sequenceCount: sequenceUnits.length,
    referenceCount: referenceEntities.length,
    outputCount: snapshot.outputRequests.length,
    sequenceUnits: sequenceUnits.slice(0, 12).map((entity) => ({
      key: entity.key,
      name: entity.name,
      summary: entity.summary,
    })),
    referenceEntities: referenceEntities.slice(0, 16).map((entity) => ({
      key: entity.key,
      name: entity.name,
      nodeType: entity.nodeType,
      summary: entity.summary,
    })),
    outputs: [...comicOutputs, ...cinematicOutputs].slice(0, 10).map((request) => ({
      id: request.id,
      title: request.title,
      outputKind: request.outputKind,
      status: request.status,
    })),
    promptContext: [
      `World: ${title}`,
      logline ? `Logline: ${logline}` : '',
      synopsis ? `Synopsis: ${synopsis}` : '',
      artStyleDescription ? `World art direction: ${artStyleDescription}` : '',
      sequenceUnits.length > 0 ? `Existing sequence units: ${sequenceUnits.slice(0, 8).map(compactEntityLabel).join(' / ')}` : '',
      referenceEntities.length > 0 ? `Existing usable references: ${referenceEntities.slice(0, 12).map(compactEntityLabel).join(' / ')}` : '',
    ].filter(Boolean).join('\n'),
  }
}

export function createVibeDirectorSession(now = new Date().toISOString()): VibeDirectorSession {
  return vibeDirectorSessionSchema.parse({
    version: 3,
    mode: 'empty_world_seed',
    phase: 'premise_intake',
    updatedAt: now,
    messages: [
      {
        id: `agent-${Date.now()}`,
        role: 'agent',
        text: 'Start with a premise, scene idea, or screenplay excerpt. I will classify it, lock the art direction, then build the world references needed for a comic scene.',
        createdAt: now,
        phase: 'premise_intake',
      },
    ],
  })
}

export function createVibeDirectorSessionForSnapshot(
  snapshot: Pick<ProjectSnapshot, 'project' | 'draft' | 'worldEntities' | 'outputRequests'>,
  now = new Date().toISOString(),
): VibeDirectorSession {
  const summary = buildVibeWorldStateSummary(snapshot)
  if (!summary.populated) return createVibeDirectorSession(now)

  const mode: VibeDirectorMode = summary.sequenceCount > 0 ? 'existing_sequence' : 'new_sequence_in_world'
  const selectedSequenceKey = summary.sequenceUnits[0]?.key ?? null
  const selectedReferenceKeys = summary.referenceEntities.slice(0, 8).map((entity) => entity.key)
  const selectedOutputId = summary.outputs[0]?.id ?? null

  return vibeDirectorSessionSchema.parse({
    version: 3,
    mode,
    canonMode: 'canon_scene',
    phase: 'world_target_selection',
    premise: summary.logline || summary.synopsis || '',
    premiseKind: summary.logline || summary.synopsis ? 'premise' : 'unknown',
    artStyleDescription: summary.artStyleDescription,
    palette: summary.palette,
    lockedArtStyle: summary.hasWorldStyle,
    brandAtlasAssetKey: summary.brandAtlasAssetKey || null,
    selectedWorldTargetSequenceKey: selectedSequenceKey,
    selectedSequenceUnitKey: selectedSequenceKey,
    selectedWorldReferenceEntityKeys: selectedReferenceKeys,
    approvedReferenceEntityKeys: selectedReferenceKeys,
    selectedOutputRequestId: selectedOutputId,
    updatedAt: now,
    metadata: {
      worldStateSummary: summary,
    },
    messages: [
      {
        id: `agent-${Date.now()}`,
        role: 'agent',
        text: summary.sequenceCount > 0
          ? `This world is already populated. Choose an existing sequence, make a new scene in this world, or direct a custom comic/cinematic using the current canon.`
          : `This world already has ${summary.referenceCount} usable reference(s), but no sequence unit yet. Start by creating a new scene in this world or direct a custom output from selected refs.`,
        createdAt: now,
        phase: 'world_target_selection',
      },
    ],
  })
}

export function parseVibeDirectorSession(value: unknown): VibeDirectorSession | null {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
  const migratedV2Base = record && record.version === 1
    ? {
        ...record,
        version: 2,
        outputPath: record.outputRequestId ? 'comic' : 'undecided',
        comicOutputRequestId: record.outputRequestId ?? null,
        cinematicMasterRequestId: null,
        screenplayApproved: false,
        shotPlanApproved: false,
        storyboardApproved: false,
        selectedCinematicShotIds: [],
        selectedComicReferenceArtifactKeys: [],
        directingNotes: {},
        recommendedActions: [],
      }
    : value
  const migratedV2Record = migratedV2Base && typeof migratedV2Base === 'object' && !Array.isArray(migratedV2Base)
    ? migratedV2Base as Record<string, unknown>
    : null
  const migrated = migratedV2Record && migratedV2Record.version === 2
    ? {
        ...migratedV2Record,
        version: 3,
        phase: migratedV2Record.phase === 'style_lock' ? 'style_lock' : migratedV2Record.phase,
        directingStylePreset: 'classical_continuity',
        directingStyleLocked: false,
        directingStyleDescription: '',
        coverageStyle: 'classical continuity coverage with clear geography and motivated shot progression',
        cameraLanguage: 'controlled camera placement, readable blocking, varied shot scale',
        editingRhythm: 'measured escalation with clean cause-and-effect cuts',
        performanceMode: 'grounded performance with readable emotional turns',
        moodEngine: 'cinematic tension shaped by character objective and location atmosphere',
        directingAvoidList: [],
        shotDirectingNotesByShotId: {},
        appliedShotRecommendationIds: [],
        continuityInspectorDismissedWarnings: [],
      }
    : migratedV2Base
  const parsed = vibeDirectorSessionSchema.safeParse(migrated)
  return parsed.success ? parsed.data : null
}

export function classifyVibePremise(input: string): VibeDirectorSession['premiseKind'] {
  const text = input.trim()
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 8) return 'nonsense'
  const lower = text.toLowerCase()
  const screenplaySignals = [
    /^int\./im,
    /^ext\./im,
    /^#scene/im,
    /\bcut to:/i,
    /\bcharacter[s]?\s*:/i,
    /\bdialogue\b/i,
  ]
  if (screenplaySignals.some((pattern) => pattern.test(text))) return 'script'
  if (!/[a-z]{3,}/i.test(text) || /(asdf|lorem ipsum|test test|blah blah)/i.test(lower)) return 'nonsense'
  return 'premise'
}

export function buildVibeQualityGates(target: 'sequence' | 'screenplay' | 'comic'): VibeDirectorQualityGate[] {
  const gateLabels = target === 'sequence'
    ? ['Dramatic question', 'Scene objective', 'Escalation', 'World/style fit']
    : target === 'screenplay'
      ? ['Pacing', 'Dialogue', 'Character voice', 'Visual staging', 'Continuity', 'Producibility']
      : ['Panel readability', 'Page turns', 'Action clarity', 'Visual variety', 'Speech density', 'Page continuity']
  return gateLabels.map((label, index) => ({
    id: `${target}-${index + 1}`,
    label,
    target,
    status: 'pending',
    findings: [],
    fixSummary: '',
  }))
}

export const VIBE_DIRECTING_STYLE_PRESETS: Array<{
  id: VibeDirectorDirectingStylePreset
  label: string
  coverageStyle: string
  cameraLanguage: string
  editingRhythm: string
  performanceMode: string
  moodEngine: string
  avoidList: string[]
}> = [
  {
    id: 'classical_continuity',
    label: 'Classical continuity',
    coverageStyle: 'establishing geography, matched eyelines, motivated inserts, and clean shot/reverse-shot coverage',
    cameraLanguage: 'stable camera placement with deliberate pushes, over-the-shoulders, and geography-preserving wides',
    editingRhythm: 'clear cause-and-effect cutting with escalating shot scale',
    performanceMode: 'grounded acting with readable subtext and restrained gesture',
    moodEngine: 'tension from objective, obstacle, and spatial clarity',
    avoidList: ['unmotivated angle flips', 'random handheld drift', 'confusing screen direction'],
  },
  {
    id: 'handheld_realism',
    label: 'Handheld realism',
    coverageStyle: 'observational coverage that keeps subjects alive in the space while preserving readable geography',
    cameraLanguage: 'handheld proximity, imperfect reframing, naturalistic push-ins, and practical lens height',
    editingRhythm: 'breathing cuts that hold reactions long enough to feel discovered',
    performanceMode: 'naturalist performance with interrupted speech and small physical behavior',
    moodEngine: 'immediacy, pressure, and lived-in environmental texture',
    avoidList: ['over-choreographed camera moves', 'glossy artificial blocking', 'perfectly symmetrical coverage'],
  },
  {
    id: 'slow_cinema',
    label: 'Slow cinema',
    coverageStyle: 'patient long takes, negative space, and sparse coverage where blocking carries story information',
    cameraLanguage: 'locked-off or minimal movement with strong frame geometry and distance',
    editingRhythm: 'few cuts, long holds, and delayed emphasis',
    performanceMode: 'subtle internal performance with silence and posture doing narrative work',
    moodEngine: 'duration, atmosphere, absence, and unresolved emotional pressure',
    avoidList: ['rapid coverage', 'excessive inserts', 'busy camera movement'],
  },
  {
    id: 'anime_action',
    label: 'Anime action',
    coverageStyle: 'impact-focused action coverage with anticipation, strike emphasis, reaction, and aftermath beats',
    cameraLanguage: 'dynamic angles, speed-line compositions, snap zoom energy, and strong silhouettes',
    editingRhythm: 'elastic rhythm: hold anticipation, accelerate impact, then freeze emotional consequence',
    performanceMode: 'heightened physical acting with clear emotion shapes and readable poses',
    moodEngine: 'kinetic escalation, iconic poses, and emotional release',
    avoidList: ['muddy silhouettes', 'flat impact staging', 'unreadable motion blur'],
  },
  {
    id: 'noir_suspense',
    label: 'Noir suspense',
    coverageStyle: 'withholding coverage, shadow reveals, foreground occlusion, and suspicious eyeline construction',
    cameraLanguage: 'low angles, hard silhouettes, long-lens compression, and light-source motivated frames',
    editingRhythm: 'slow tightening with sharp reveal cuts',
    performanceMode: 'controlled performance with guarded eyes and minimal gestures',
    moodEngine: 'paranoia, moral pressure, and obscured intent',
    avoidList: ['flat frontal coverage', 'overlit spaces', 'explaining every reveal too early'],
  },
  {
    id: 'precision_thriller',
    label: 'Precision thriller',
    coverageStyle: 'controlled coverage with exact object geography, procedural inserts, and clean cause-effect blocking',
    cameraLanguage: 'precise locked frames, calculated dolly moves, centered pressure, and long-lens surveillance',
    editingRhythm: 'tight economical cuts with no wasted emphasis',
    performanceMode: 'contained performance, micro-reactions, and tactical attention',
    moodEngine: 'control, threat math, and procedural inevitability',
    avoidList: ['loose blocking', 'unclear prop positions', 'decorative camera movement'],
  },
  {
    id: 'romantic_melancholy',
    label: 'Romantic melancholy',
    coverageStyle: 'intimate reaction coverage, reflective inserts, and emotional distance inside shared space',
    cameraLanguage: 'soft lateral movement, close profiles, long-lens separation, and window/reflection framing',
    editingRhythm: 'lingering cuts with emotional overlap between shots',
    performanceMode: 'quiet longing, withheld speech, and small shifts of gaze',
    moodEngine: 'memory, missed timing, softness, and ache',
    avoidList: ['overstated emotion', 'busy action coverage', 'hard procedural cutting'],
  },
  {
    id: 'mythic_epic',
    label: 'Mythic epic',
    coverageStyle: 'large-scale geography, ceremonial blocking, iconic silhouettes, and consequential reveals',
    cameraLanguage: 'wide frames, low heroic angles, sweeping moves, and strong foreground/background staging',
    editingRhythm: 'grand escalation with pauses for awe and consequence',
    performanceMode: 'heightened but sincere performance with ritual weight',
    moodEngine: 'awe, fate, scale, and symbolic contrast',
    avoidList: ['small casual coverage', 'throwaway inserts', 'unclear scale'],
  },
]

export function buildVibeDirectingStylePrompt(session: Pick<VibeDirectorSession,
  'directingStylePreset'
  | 'directingStyleDescription'
  | 'coverageStyle'
  | 'cameraLanguage'
  | 'editingRhythm'
  | 'performanceMode'
  | 'moodEngine'
  | 'directingAvoidList'
>) {
  const preset = VIBE_DIRECTING_STYLE_PRESETS.find((entry) => entry.id === session.directingStylePreset)
  return [
    `Directing style: ${preset?.label ?? session.directingStylePreset}.`,
    session.directingStyleDescription ? `Director brief: ${session.directingStyleDescription}` : '',
    `Coverage style: ${session.coverageStyle}.`,
    `Camera language: ${session.cameraLanguage}.`,
    `Editing rhythm: ${session.editingRhythm}.`,
    `Performance mode: ${session.performanceMode}.`,
    `Mood engine: ${session.moodEngine}.`,
    session.directingAvoidList.length > 0 ? `Avoid: ${session.directingAvoidList.join(', ')}.` : '',
  ].filter(Boolean).join('\n')
}

export function buildVibeDirectorWorkflowBrief(session: Pick<VibeDirectorSession,
  'artStyleDescription'
  | 'comicPanelStyle'
  | 'letteringStyle'
  | 'palette'
  | 'directingStylePreset'
  | 'directingStyleDescription'
  | 'coverageStyle'
  | 'cameraLanguage'
  | 'editingRhythm'
  | 'performanceMode'
  | 'moodEngine'
  | 'directingAvoidList'
  | 'outputPath'
  | 'qualityGateMode'
  | 'selectedComicReferenceArtifactKeys'
  | 'shotDirectingNotesByShotId'
>) {
  return vibeDirectorWorkflowBriefSchema.parse({
    artStyleDescription: session.artStyleDescription,
    comicPanelStyle: session.comicPanelStyle,
    letteringStyle: session.letteringStyle,
    palette: session.palette,
    directingStylePreset: session.directingStylePreset,
    directingStyle: buildVibeDirectingStylePrompt({
      directingStylePreset: session.directingStylePreset,
      directingStyleDescription: session.directingStyleDescription,
      coverageStyle: session.coverageStyle,
      cameraLanguage: session.cameraLanguage,
      editingRhythm: session.editingRhythm,
      performanceMode: session.performanceMode,
      moodEngine: session.moodEngine,
      directingAvoidList: session.directingAvoidList,
    }),
    coverageStyle: session.coverageStyle,
    cameraLanguage: session.cameraLanguage,
    editingRhythm: session.editingRhythm,
    performanceMode: session.performanceMode,
    moodEngine: session.moodEngine,
    avoidList: session.directingAvoidList,
    outputPath: session.outputPath,
    qualityGateMode: session.qualityGateMode,
    selectedComicReferenceArtifactKeys: session.selectedComicReferenceArtifactKeys,
    shotDirectingNotesByShotId: session.shotDirectingNotesByShotId,
  })
}

export function formatVibeDirectorWorkflowBriefForPrompt(value: unknown) {
  const parsed = vibeDirectorWorkflowBriefSchema.safeParse(value)
  if (!parsed.success) return ''
  const brief = parsed.data
  return [
    brief.artStyleDescription ? `Locked art style: ${brief.artStyleDescription}` : '',
    brief.directingStyle ? brief.directingStyle : '',
    brief.outputPath !== 'undecided' ? `Target output path: ${brief.outputPath}.` : '',
    `Quality gate mode: ${brief.qualityGateMode}.`,
    Object.keys(brief.shotDirectingNotesByShotId).length > 0
      ? `Shot-specific direction: ${Object.entries(brief.shotDirectingNotesByShotId).map(([shotId, note]) => `${shotId}: ${note}`).join(' / ')}`
      : '',
    brief.selectedComicReferenceArtifactKeys.length > 0
      ? `Comic page references are optional action/composition guidance only: ${brief.selectedComicReferenceArtifactKeys.join(', ')}.`
      : '',
  ].filter(Boolean).join('\n')
}

function readText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function shotText(shot: Record<string, unknown>) {
  return [
    readText(shot.title),
    readText(shot.purpose),
    readText(shot.action),
    readText(shot.description),
    readText(shot.camera),
    readText(shot.performance),
    readText(shot.dialogue),
  ].join(' ').toLowerCase()
}

export function buildVibeShotRecommendations(input: {
  shot: Record<string, unknown>
  directingStyle?: Partial<VibeDirectorSession>
  alreadyAppliedIds?: string[]
}) {
  const shotId = readText(input.shot.id) || readText(input.shot.shotId) || 'shot'
  const text = shotText(input.shot)
  const purpose = readText(input.shot.purpose).toLowerCase()
  const recommendations: VibeShotRecommendation[] = []
  const add = (suffix: string, recommendation: Omit<VibeShotRecommendation, 'id' | 'targetType' | 'targetId'>) => {
    const id = `${shotId}-${suffix}`
    if (input.alreadyAppliedIds?.includes(id)) return
    recommendations.push(vibeShotRecommendationSchema.parse({
      id,
      targetType: 'shot',
      targetId: shotId,
      ...recommendation,
    }))
  }

  if (purpose.includes('dialogue') || /\b(says|asks|whispers|argues|confesses|dialogue)\b/.test(text)) {
    add('dialogue-pressure', {
      label: 'Tighten the dialogue pressure',
      rationale: 'The shot carries spoken conflict, so coverage should make eyeline, subtext, and reaction timing readable.',
      camera: 'dirty over-the-shoulder into a tightening reverse angle',
      lensFraming: 'medium close-up compressing the background slightly',
      movement: 'slow motivated push only when the power balance changes',
      editRhythm: 'hold the listener a beat longer than the speaker',
      performanceNote: 'prioritize eyes, breath, and interrupted micro-reactions',
      continuityRationale: 'Preserves eyeline and screen direction while escalating intimacy.',
      riskLevel: 'low',
    })
  }

  if (purpose.includes('action') || /\b(runs|chase|fight|strikes|escapes|falls|collides|impact|pursuit)\b/.test(text)) {
    add('action-geography', {
      label: 'Protect action geography',
      rationale: 'The shot has physical motion, so the viewer needs a spatial reset before impact or pursuit detail.',
      camera: 'wide reset followed by a lateral tracking beat',
      lensFraming: 'wide-to-medium progression with clean silhouettes',
      movement: 'track parallel to movement direction, then cut to impact insert',
      editRhythm: 'anticipation hold, quick impact, short aftermath beat',
      performanceNote: 'make body direction and weight transfer explicit',
      continuityRationale: 'Reduces screen-direction flips and keeps zone/spot geography legible.',
      riskLevel: 'medium',
    })
  }

  if (purpose.includes('reveal') || /\b(reveals|discovers|sees|notices|appears|hidden|unveils)\b/.test(text)) {
    add('withheld-reveal', {
      label: 'Withhold the reveal',
      rationale: 'Reveal beats land harder when the frame delays the object or subject until reaction and focus are prepared.',
      camera: 'start on reaction or foreground obstruction before revealing subject',
      lensFraming: 'shallow close-up or occluded wide with a controlled reveal lane',
      movement: 'rack focus, slow pan, or push-in timed to realization',
      editRhythm: 'delay the cut until the audience anticipates the reveal',
      performanceNote: 'let recognition register before the reveal is fully explained',
      continuityRationale: 'Keeps the reveal anchored to the character POV and avoids random visual surprise.',
      riskLevel: 'low',
    })
  }

  if (purpose.includes('insert') || /\b(hand|object|item|letter|map|key|device|blood|symbol)\b/.test(text)) {
    add('tactile-insert', {
      label: 'Use a tactile insert',
      rationale: 'A continuity-critical object or gesture appears; a precise insert can clarify cause and consequence.',
      camera: 'locked insert with enough surrounding context to locate the object',
      lensFraming: 'macro or tight close-up with one readable landmark',
      movement: 'minimal movement; let the hand or object action provide motion',
      editRhythm: 'cut in only after the viewer knows who controls the object',
      performanceNote: 'hands should show intention, hesitation, or force',
      continuityRationale: 'Clarifies prop state without replacing the canonical prop/reference sheet.',
      riskLevel: 'medium',
    })
  }

  if (purpose.includes('reaction') || /\b(realizes|reacts|stares|freezes|hesitates|tears|smiles)\b/.test(text)) {
    add('held-reaction', {
      label: 'Hold the reaction',
      rationale: 'The beat is emotional, so the camera should give performance time to change inside the frame.',
      camera: 'still close-up with negative space oriented toward the pressure source',
      lensFraming: 'close-up or profile close-up with stable eyeline',
      movement: 'no movement unless the emotion turns into decision',
      editRhythm: 'hold past the obvious endpoint by one beat',
      performanceNote: 'shape the beat around eyes, jaw, breath, and posture',
      continuityRationale: 'Keeps emotional continuity readable between surrounding action shots.',
      riskLevel: 'low',
    })
  }

  if (recommendations.length === 0) {
    add('coverage-clarity', {
      label: 'Clarify the shot purpose',
      rationale: 'The shot can be directed more strongly by choosing one dominant visual job.',
      camera: 'compose around one subject anchor and one readable environment cue',
      lensFraming: 'medium-wide or medium shot depending on action distance',
      movement: 'single motivated camera move only',
      editRhythm: 'cut on decision, reveal, or physical change',
      performanceNote: 'make the subject intention visible before cutting away',
      continuityRationale: 'Avoids decorative coverage and keeps the shot compatible with downstream keyframes.',
      riskLevel: 'low',
    })
  }

  return recommendations.slice(0, 4)
}

export function buildVibeContinuityInspector(input: {
  shot: Record<string, unknown> | null
  comicReferenceArtifactKeys?: string[]
  dismissedWarnings?: string[]
}) {
  const shot = input.shot ?? {}
  const shotId = readText(shot.id) || readText(shot.shotId)
  const spatialBinding = asRecord(shot.spatialBindingView)
  const spatialHierarchy = readArray(spatialBinding.hierarchy).map(asRecord)
  const characterRefs = [
    ...readArray(shot.visibleCharacterRefIds),
    ...readArray(shot.speakerRefIds),
    ...readArray(shot.participantRefIds),
  ].map(readText).filter(Boolean)
  const propRefs = [
    ...readArray(shot.propRefIds),
    ...readArray(shot.continuityAnchorRefIds),
  ].map(readText).filter(Boolean)
  const storyboardRefs = [
    readText(shot.panelAssetKey),
    readText(shot.panelUrl),
    ...readArray(shot.storyboardRefIds).map(readText),
  ].filter(Boolean)
  const previousVisualRefs = [
    ...readArray(input.comicReferenceArtifactKeys).map(readText),
    readText(shot.previousKeyframeAssetKey),
    readText(shot.previous_keyframe_asset_key),
  ].filter(Boolean)
  const warnings = [
    characterRefs.length === 0 ? 'No explicit character/speaker refs found for this shot.' : '',
    spatialHierarchy.length === 0 ? 'No set/zone/spot hierarchy is loaded for this shot.' : '',
    storyboardRefs.length === 0 ? 'No storyboard panel reference is ready for this shot.' : '',
    readText(shot.keyframeStatusLabel).toLowerCase().includes('not generated') && previousVisualRefs.length === 0
      ? 'No previous visual reference is available; continuity will rely on canonical refs only.'
      : '',
  ].filter(Boolean).filter((warning) => !(input.dismissedWarnings ?? []).includes(`${shotId}:${warning}`))
  const recommendedFixes: VibeDirectorRecommendation[] = []
  if (spatialHierarchy.length === 0) {
    recommendedFixes.push({
      id: `${shotId || 'shot'}-prepare-storyboards`,
      label: 'Prepare storyboard/continuity',
      actionKind: 'prepare_storyboards',
      targetPhase: 'cinematic_storyboard_generation',
      rationale: 'Storyboard blocks and continuity prep help recover shot geography before keyframes.',
      payload: { shotId },
    })
  }
  if (warnings.length > 0) {
    recommendedFixes.push({
      id: `${shotId || 'shot'}-prepare-keyframes`,
      label: 'Generate after refs are ready',
      actionKind: 'prepare_keyframes',
      targetPhase: 'cinematic_keyframe_generation',
      rationale: 'Run keyframes only through the shot production graph so reference packs can fix missing inputs.',
      payload: { shotId },
    })
  }
  return vibeContinuityInspectorSchema.parse({
    shotId,
    readiness: warnings.length === 0 ? 'ready' : spatialHierarchy.length === 0 || characterRefs.length === 0 ? 'blocked' : 'warning',
    summary: shotId ? `Continuity read for ${shotId}.` : 'Select a shot to inspect continuity.',
    characterRefs: [...new Set(characterRefs)],
    spatialRefs: spatialHierarchy.map((node) => readText(node.label) || readText(node.id)).filter(Boolean),
    propRefs: [...new Set(propRefs)],
    storyboardRefs: [...new Set(storyboardRefs)],
    previousVisualRefs: [...new Set(previousVisualRefs)],
    warnings,
    recommendedFixes,
  })
}

export function buildVibeRecommendedActions(input: {
  session: VibeDirectorSession
  referenceCount: number
  sequenceCount: number
  hasComicOutput: boolean
  hasCinematicOutput: boolean
}) {
  const { session } = input
  const actions: VibeDirectorRecommendation[] = []
  const add = (
    id: string,
    label: string,
    actionKind: VibeDirectorRecommendation['actionKind'],
    targetPhase: VibeDirectorPhase,
    rationale = '',
    payload: Record<string, unknown> = {},
  ) => actions.push({ id, label, actionKind, targetPhase, rationale, payload })

  if (session.phase === 'world_target_selection') {
    if (input.sequenceCount > 0) {
      add('use-existing-sequence', 'Use existing sequence', 'select_existing_sequence', 'sequence_unit_review', 'Direct a sequence unit that is already in this world.')
    }
    add('new-scene-in-world', 'Create new scene', 'start_new_world_scene', 'reference_build', 'Add a new canon scene while reusing existing world references.')
    add('custom-cinematic-world', 'Custom cinematic', 'start_custom_cinematic', 'cinematic_screenplay_review', 'Make a cinematic grounded in this world; save to canon only if needed.')
    add('custom-comic-world', 'Custom comic', 'start_custom_comic', 'comic_generation', 'Make a comic scene grounded in current world refs.')
    if (input.hasComicOutput || input.hasCinematicOutput) {
      add('continue-output', 'Continue output', 'continue_output', 'output_review', 'Pick an existing comic or cinematic run to rework or extend.')
    }
  } else if (session.phase === 'premise_intake') {
    add('accept-source', 'Classify source', 'accept_premise', 'premise_intake', 'Check whether this is a usable premise or screenplay excerpt.')
  } else if (session.phase === 'style_lock') {
    add('lock-style', 'Lock current style', 'lock_style', 'style_lock', 'Freeze the look before visual references are generated.')
    add('lock-directing-next', 'Set directing style', 'lock_directing_style', 'directing_style_lock', 'Choose coverage, camera, rhythm, performance, and mood before cinematics.')
  } else if (session.phase === 'directing_style_lock') {
    add('lock-directing', 'Lock directing style', 'lock_directing_style', 'directing_style_lock', 'Freeze the scene grammar before screenplay and shot planning.')
    add('generate-atlas-next', 'Generate atlas', 'generate_atlas', 'brand_atlas_review', 'Move into art-direction proofing with visual and directorial taste locked.')
  } else if (session.phase === 'brand_atlas_review') {
    add('generate-atlas', session.brandAtlasAssetKey ? 'Regenerate atlas' : 'Generate atlas', 'generate_atlas', 'brand_atlas_review', 'Create a visual proof before building world refs.')
    add('build-refs', 'Build scene refs', 'build_references', 'reference_build', 'Create the characters, item, and place needed for the scene.')
  } else if (session.phase === 'reference_build') {
    add('queue-sheets', 'Queue reference sheets', 'queue_reference_sheets', 'reference_build', 'Make durable visual anchors for downstream comic and cinematic work.')
    add('create-sequence', 'Create scene unit', 'create_sequence', 'sequence_unit_review', 'Turn approved refs into one directed scene unit.')
  } else if (session.phase === 'sequence_unit_review') {
    add('choose-both', 'Make comic + cinematic', 'choose_both', 'output_path_choice', 'Best for adapting one scene into pages and shots.')
    add('choose-cinematic', 'Go cinematic first', 'choose_cinematic', 'output_path_choice', 'Start screenplay, shot plan, storyboards, and keyframes.')
    add('choose-comic', 'Go comic first', 'choose_comic', 'output_path_choice', 'Start pages first, then optionally adapt them into cinematic.')
  } else if (session.phase === 'output_path_choice') {
    if (session.outputPath === 'comic' || session.outputPath === 'both') {
      add('start-comic', 'Start comic workflow', 'start_comic', 'comic_generation', 'Generate the page plan, script, page art, and PDF.')
    }
    if (session.outputPath === 'cinematic' || session.outputPath === 'both') {
      add('start-cinematic', 'Start cinematic master', 'start_cinematic', 'cinematic_screenplay_review', 'Generate screenplay and shot continuity plan.')
    }
    if (session.outputPath === 'undecided') {
      add('choose-both-default', 'Use both outputs', 'choose_both', 'output_path_choice', 'Keep the flow flexible and branch after the first artifact.')
    }
  } else if (session.phase === 'comic_generation') {
    if (!input.hasComicOutput) add('start-comic-active', 'Start comic workflow', 'start_comic', 'comic_generation', 'Queue the comic output graph.')
    add('comic-to-cinematic', 'Continue into cinematic', 'continue_comic_to_cinematic', 'cinematic_screenplay_review', 'Use comic rhythm and pages as optional action references.')
    add('open-outputs-comic', 'Inspect Outputs', 'open_outputs', 'output_review', 'Review graph progress, page art, and PDF artifacts.')
  } else if (session.phase === 'cinematic_screenplay_review') {
    if (!input.hasCinematicOutput) add('start-cinematic-active', 'Start cinematic master', 'start_cinematic', 'cinematic_screenplay_review', 'Queue the V3 screenplay animatic master graph.')
    add('prepare-storyboards', 'Prepare storyboards', 'prepare_storyboards', 'cinematic_storyboard_generation', 'Materialize storyboard blocks from the shot plan.')
    add('open-outputs-cinematic', 'Inspect animatic', 'open_outputs', 'cinematic_screenplay_review', 'Use the full animatic workspace for detailed review.')
  } else if (session.phase === 'cinematic_storyboard_generation') {
    add('prepare-storyboards-active', 'Prepare storyboard blocks', 'prepare_storyboards', 'cinematic_storyboard_generation', 'Generate storyboard panels and video prompts for blocks.')
    add('prepare-keyframes', 'Generate keyframes', 'prepare_keyframes', 'cinematic_keyframe_generation', 'Use shot reference packs and continuity assets for selected shots.')
  } else if (session.phase === 'cinematic_keyframe_generation') {
    add('prepare-keyframes-active', 'Generate keyframes', 'prepare_keyframes', 'cinematic_keyframe_generation', 'Queue keyframes through the shot production graph.')
    add('prepare-continuity', 'Inspect continuity first', 'prepare_continuity', 'cinematic_keyframe_generation', 'Check refs, zone/spot state, and previous visuals before image generation.')
    add('open-outputs-keyframes', 'Inspect shot graphs', 'open_outputs', 'output_review', 'Review exact references, prompt plan, and artifacts.')
  } else {
    add('open-outputs', 'Open Outputs', 'open_outputs', 'output_review', 'Inspect generated artifacts and workflow graphs.')
    add('open-wiki', 'Open Wiki', 'open_wiki', 'output_review', 'Review canon and visual reference state.')
  }

  return actions.slice(0, 4)
}

export function buildBrandAtlasPrompt(input: {
  premise: string
  artStyleDescription: string
  comicPanelStyle: string
  letteringStyle: string
  palette: string[]
}) {
  return [
    'Create a GraphCore world brand atlas image for vibe-directed comic and cinematic production.',
    `Premise: ${input.premise || 'Use the current project world premise.'}`,
    `Art direction: ${input.artStyleDescription || 'Cinematic, coherent, production-ready visual identity.'}`,
    input.comicPanelStyle ? `Comic panel style: ${input.comicPanelStyle}.` : '',
    input.letteringStyle ? `Lettering and script-word style: ${input.letteringStyle}.` : '',
    input.palette.length > 0 ? `Primary palette: ${input.palette.join(', ')}.` : 'Derive a restrained primary palette and show it as visual swatches.',
    'The atlas must show a close-up human head/face, full-body figure, symbolic marks, material/texture samples, structures, one location example, comic panel treatment, and lettering treatment.',
    'Keep the image visual-only. Avoid UI chrome, GraphCore wording, schema diagrams, internal IDs, watermarks, and dense text labels.',
  ].filter(Boolean).join('\n')
}

export function buildVibeReferencePrompt(input: {
  premise: string
  artStyleDescription: string
  comicPanelStyle: string
  palette: string[]
  worldSummary?: string
  selectedSequenceName?: string
  selectedReferenceNames?: string[]
  canonMode?: VibeDirectorCanonMode
}) {
  return [
    'Build the first scene world references for a vibe-directed comic.',
    input.worldSummary ? `Current world context:\n${input.worldSummary}` : '',
    `Premise or script basis: ${input.premise}`,
    input.selectedSequenceName ? `Selected sequence anchor: ${input.selectedSequenceName}` : '',
    input.selectedReferenceNames?.length ? `Selected existing refs to reuse: ${input.selectedReferenceNames.join(', ')}` : '',
    input.canonMode ? `Canon mode: ${input.canonMode}.` : '',
    `Locked art direction: ${input.artStyleDescription}`,
    input.comicPanelStyle ? `Comic panel style: ${input.comicPanelStyle}` : '',
    input.palette.length > 0 ? `Palette: ${input.palette.join(', ')}` : '',
    'Create only the references needed for the first scene: up to three characters, one important item if useful, and one primary place.',
    'Reuse existing world entities by name/key wherever possible. Create new characters, items, or places only when the scene explicitly needs something missing.',
    'For the place, include structured spatial metadata for zones and spots so comics and later animatics can stage action consistently.',
    'Persist stable visual identity metadata for every generated entity. Actors must also get stable voice metadata.',
    'Do not generate outputs yet. Add canon/world references only.',
  ].filter(Boolean).join('\n')
}

export function buildVibeSequencePrompt(input: {
  premise: string
  referenceNames: string[]
  worldSummary?: string
  selectedSequenceName?: string
  canonMode?: VibeDirectorCanonMode
}) {
  return [
    'Create one sequence_unit for the first vibe-directed comic scene.',
    input.worldSummary ? `Current world context:\n${input.worldSummary}` : '',
    `Premise or script basis: ${input.premise}`,
    input.selectedSequenceName ? `Related existing sequence: ${input.selectedSequenceName}` : '',
    input.canonMode ? `Canon mode: ${input.canonMode}.` : '',
    input.referenceNames.length > 0 ? `Approved references: ${input.referenceNames.join(', ')}` : '',
    'Reuse existing world entities and relationships where possible. Only create new canon facts if the requested scene requires them.',
    'The sequence unit should have a strong scene objective, dramatic question, concise synopsis, outcome, and shot-readable action beats.',
    'Do not create a full screenplay or output artifact yet.',
  ].filter(Boolean).join('\n')
}

export function buildVibeCinematicPrompt(input: {
  premise: string
  artStyleDescription: string
  directingStylePrompt?: string
  sequenceName: string
  referenceNames: string[]
  directingNotes: string[]
  comicSummary?: string
  worldSummary?: string
  canonMode?: VibeDirectorCanonMode
}) {
  return [
    `Create a screenplay animatic for ${input.sequenceName || 'the selected vibe-directed scene'}.`,
    input.worldSummary ? `Current world context:\n${input.worldSummary}` : '',
    input.premise ? `Source premise or script: ${input.premise}` : '',
    input.canonMode ? `Canon mode: ${input.canonMode}.` : '',
    input.artStyleDescription ? `Locked art direction: ${input.artStyleDescription}` : '',
    input.directingStylePrompt ? input.directingStylePrompt : '',
    input.referenceNames.length > 0 ? `Approved scene references: ${input.referenceNames.join(', ')}` : '',
    input.directingNotes.length > 0 ? `Vibe directing notes: ${input.directingNotes.join(' / ')}` : '',
    input.comicSummary ? `Comic adaptation guidance: ${input.comicSummary}` : '',
    'Generate a clean creative screenplay, then build the shot continuity plan, continuity graph, reference assignments, and storyboard blocks.',
    'Use canonical world reference sheets and location/zone continuity as identity and spatial authority. Comic pages, if available, are action/composition guidance only.',
    'Stop before video generation. Storyboards and keyframes should remain manually approved downstream steps.',
  ].filter(Boolean).join('\n')
}
