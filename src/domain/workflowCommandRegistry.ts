import { z } from 'zod'

export const workflowCommandFamilySchema = z.enum(['sequence_animatic', 'scene_board'])

export const workflowCommandActionSchema = z.enum([
  'prepare_scene_board',
  'regenerate_scene_board_zone',
  'generate_coverage_intents',
  'generate_zone_coverage_grids',
  'generate_coverage_anchors',
  'generate_keyframes',
  'generate_shot_video',
  'revise_shot',
  'generate_continuity_assets',
])

export const workflowCommandScopeSchema = z.object({
  masterRequestId: z.string().min(1),
  sceneId: z.string().min(1).optional(),
  setId: z.string().min(1).nullable().optional(),
  zoneId: z.string().min(1).nullable().optional(),
  scopeNodeId: z.string().min(1).nullable().optional(),
  shotIds: z.array(z.string().min(1)).default([]),
  coverageSetupIds: z.array(z.string().min(1)).default([]),
  storyboardBlockId: z.string().min(1).optional(),
  shotId: z.string().min(1).optional(),
  nodeIds: z.array(z.string().min(1)).default([]),
}).strict()

export const workflowCommandFlagsSchema = z.object({
  forceRefresh: z.boolean().default(false),
  allowProvisional: z.boolean().default(false),
  regenerate: z.boolean().default(false),
}).strict()

export const workflowCommandSchema = z.object({
  family: workflowCommandFamilySchema,
  action: workflowCommandActionSchema,
  projectId: z.string().min(1).optional(),
  draftId: z.string().min(1).optional(),
  scope: workflowCommandScopeSchema,
  flags: workflowCommandFlagsSchema.default({ forceRefresh: false, allowProvisional: false, regenerate: false }),
  payload: z.record(z.string(), z.unknown()).default({}),
}).strict()

export type WorkflowCommandFamily = z.infer<typeof workflowCommandFamilySchema>
export type WorkflowCommandAction = z.infer<typeof workflowCommandActionSchema>
export type WorkflowCommand = z.infer<typeof workflowCommandSchema>
export type WorkflowCommandInput = z.input<typeof workflowCommandSchema>

export type WorkflowCommandManifest = {
  family: WorkflowCommandFamily
  action: WorkflowCommandAction
  label: string
  description: string
  templateKey: string
  legacyEndpoint: string
  targetRole: string
  projectionFamily: string
  defaultForceRefresh: boolean
}

export const workflowCommandProxyResponseSchema = z.object({
  ok: z.literal(true),
  command: workflowCommandSchema,
  manifest: z.object({
    family: workflowCommandFamilySchema,
    action: workflowCommandActionSchema,
    label: z.string(),
    description: z.string(),
    templateKey: z.string(),
    legacyEndpoint: z.string(),
    targetRole: z.string(),
    projectionFamily: z.string(),
    defaultForceRefresh: z.boolean(),
  }),
  routedTo: z.string(),
  result: z.unknown(),
}).strict()

export type WorkflowCommandProxyResponse = z.infer<typeof workflowCommandProxyResponseSchema>

const workflowCommandManifests: WorkflowCommandManifest[] = [
  {
    family: 'scene_board',
    action: 'prepare_scene_board',
    label: 'Prepare Scene Board',
    description: 'Ensure required refs, coverage directions, and zone coverage grid artifacts for a Scene Board scope.',
    templateKey: 'sequence_animatic_scene_board_prep',
    legacyEndpoint: 'start-scene-board-workflow-command',
    targetRole: 'scene_board_prep',
    projectionFamily: 'scene_board_prep',
    defaultForceRefresh: false,
  },
  {
    family: 'scene_board',
    action: 'regenerate_scene_board_zone',
    label: 'Regenerate Scene Board Zone',
    description: 'Force-regenerate zone map, spot atlas, and downstream coverage grids for a Scene Board scope.',
    templateKey: 'sequence_animatic_scene_board_prep',
    legacyEndpoint: 'start-scene-board-workflow-command',
    targetRole: 'scene_board_prep',
    projectionFamily: 'scene_board_prep',
    defaultForceRefresh: true,
  },
  {
    family: 'scene_board',
    action: 'generate_coverage_intents',
    label: 'Generate Coverage Directions',
    description: 'Generate scoped shot coverage directions from Scene Board references.',
    templateKey: 'sequence_animatic_coverage_intent_batch',
    legacyEndpoint: 'ensure-sequence-animatic-shot-coverage-intents',
    targetRole: 'coverage_intent_batch',
    projectionFamily: 'coverage_intent_batch',
    defaultForceRefresh: false,
  },
  {
    family: 'scene_board',
    action: 'generate_zone_coverage_grids',
    label: 'Generate Zone Coverage Grids',
    description: 'Generate 3x3 zone camera grids and assign cells back to shots.',
    templateKey: 'sequence_animatic_zone_coverage_board',
    legacyEndpoint: 'ensure-sequence-animatic-zone-coverage-boards',
    targetRole: 'zone_coverage_board',
    projectionFamily: 'zone_coverage_board',
    defaultForceRefresh: false,
  },
  {
    family: 'scene_board',
    action: 'generate_coverage_anchors',
    label: 'Generate Coverage Anchors',
    description: 'Generate selected coverage anchors for scoped shots.',
    templateKey: 'sequence_animatic_coverage_anchor',
    legacyEndpoint: 'ensure-sequence-animatic-keyframe-workflows',
    targetRole: 'coverage_anchor',
    projectionFamily: 'coverage_anchor',
    defaultForceRefresh: false,
  },
  {
    family: 'sequence_animatic',
    action: 'generate_keyframes',
    label: 'Generate Keyframes',
    description: 'Generate or regenerate shot keyframes for selected shots or coverage setups.',
    templateKey: 'sequence_animatic_shot_keyframes',
    legacyEndpoint: 'ensure-sequence-animatic-keyframe-workflows',
    targetRole: 'shot_keyframe',
    projectionFamily: 'shot_keyframe',
    defaultForceRefresh: false,
  },
  {
    family: 'sequence_animatic',
    action: 'generate_shot_video',
    label: 'Generate Shot Video',
    description: 'Generate a shot video workflow from an approved panel or keyframe.',
    templateKey: 'sequence_animatic_shot_video',
    legacyEndpoint: 'ensure-sequence-animatic-block-workflows',
    targetRole: 'shot_video',
    projectionFamily: 'shot_video',
    defaultForceRefresh: false,
  },
  {
    family: 'sequence_animatic',
    action: 'revise_shot',
    label: 'Revise Shot',
    description: 'Revise a shot and optionally regenerate downstream visual output.',
    templateKey: 'sequence_animatic_shot_revision',
    legacyEndpoint: 'ensure-sequence-animatic-shot-revision-workflow',
    targetRole: 'shot_revision',
    projectionFamily: 'shot_revision',
    defaultForceRefresh: true,
  },
  {
    family: 'sequence_animatic',
    action: 'generate_continuity_assets',
    label: 'Generate Continuity Assets',
    description: 'Generate continuity reference sheets, atlases, or hero refs for selected graph nodes.',
    templateKey: 'sequence_animatic_continuity_asset',
    legacyEndpoint: 'ensure-sequence-animatic-continuity-asset-workflow',
    targetRole: 'continuity_asset',
    projectionFamily: 'continuity_asset',
    defaultForceRefresh: false,
  },
]

const workflowCommandManifestByKey = new Map(workflowCommandManifests.map((manifest) => [`${manifest.family}:${manifest.action}`, manifest] as const))

export function listWorkflowCommandManifests() {
  return [...workflowCommandManifests]
}

export function getWorkflowCommandManifest(family: WorkflowCommandFamily, action: WorkflowCommandAction) {
  return workflowCommandManifestByKey.get(`${family}:${action}`) ?? null
}

export function parseWorkflowCommand(value: unknown) {
  const command = workflowCommandSchema.parse(value)
  const manifest = getWorkflowCommandManifest(command.family, command.action)
  if (!manifest) throw new Error(`Workflow command is not registered: ${command.family}:${command.action}`)
  return {
    ...command,
    flags: {
      ...command.flags,
      forceRefresh: command.flags.forceRefresh || manifest.defaultForceRefresh,
    },
    manifest,
  }
}

export function sceneBoardLegacyActionForWorkflowCommand(action: WorkflowCommandAction) {
  if (action === 'prepare_scene_board') return 'prepare_selected_board'
  if (action === 'regenerate_scene_board_zone') return 'regenerate_zone_top_down'
  if (action === 'generate_zone_coverage_grids') return 'generate_zone_coverage_grids'
  if (action === 'generate_coverage_anchors') return 'generate_selected_coverage_anchors'
  return null
}

export function legacyPayloadForWorkflowCommand(value: unknown) {
  const parsed = parseWorkflowCommand(value)
  const scope = parsed.scope
  const flags = parsed.flags
  if (parsed.family === 'scene_board' && (parsed.action === 'prepare_scene_board' || parsed.action === 'regenerate_scene_board_zone')) {
    const action = sceneBoardLegacyActionForWorkflowCommand(parsed.action)
    if (!action) throw new Error(`Workflow command cannot be routed through the Scene Board wrapper: ${parsed.action}`)
    return {
      endpoint: parsed.manifest.legacyEndpoint,
      payload: {
        projectId: parsed.projectId,
        draftId: parsed.draftId,
        masterRequestId: scope.masterRequestId,
        sceneId: scope.sceneId,
        action,
        setId: scope.setId ?? null,
        zoneId: scope.zoneId ?? null,
        scopeNodeId: scope.scopeNodeId ?? null,
        shotIds: scope.shotIds,
        forceRefresh: flags.forceRefresh,
        ...parsed.payload,
      },
      parsed,
    }
  }
  if (parsed.action === 'generate_coverage_intents') {
    return {
      endpoint: parsed.manifest.legacyEndpoint,
      payload: {
        projectId: parsed.projectId,
        draftId: parsed.draftId,
        masterRequestId: scope.masterRequestId,
        sceneId: scope.sceneId,
        setId: scope.setId ?? null,
        zoneId: scope.zoneId ?? null,
        shotIds: scope.shotIds,
        scopedShots: parsed.payload.scopedShots ?? [],
        forceRefresh: flags.forceRefresh,
        ...parsed.payload,
      },
      parsed,
    }
  }
  if (parsed.action === 'generate_zone_coverage_grids') {
    return {
      endpoint: parsed.manifest.legacyEndpoint,
      payload: {
        projectId: parsed.projectId,
        draftId: parsed.draftId,
        masterRequestId: scope.masterRequestId,
        sceneId: scope.sceneId,
        setId: scope.setId ?? null,
        zoneId: scope.zoneId ?? null,
        shotIds: scope.shotIds,
        scopedShots: parsed.payload.scopedShots ?? [],
        forceRefresh: flags.forceRefresh,
        ...parsed.payload,
      },
      parsed,
    }
  }
  if (parsed.action === 'generate_keyframes' || parsed.action === 'generate_coverage_anchors') {
    return {
      endpoint: parsed.manifest.legacyEndpoint,
      payload: {
        projectId: parsed.projectId,
        draftId: parsed.draftId,
        masterRequestId: scope.masterRequestId,
        mode: flags.forceRefresh || flags.regenerate ? 'regenerate' : 'generate',
        shotIds: scope.shotIds,
        coverageSetupIds: scope.coverageSetupIds,
        allowProvisional: flags.allowProvisional,
        ...parsed.payload,
      },
      parsed,
    }
  }
  if (parsed.action === 'generate_continuity_assets') {
    const nodeId = scope.nodeIds[0] ?? ''
    return {
      endpoint: parsed.manifest.legacyEndpoint,
      payload: {
        projectId: parsed.projectId,
        draftId: parsed.draftId,
        masterRequestId: scope.masterRequestId,
        nodeId,
        nodeIds: scope.nodeIds,
        mode: flags.forceRefresh || flags.regenerate ? 'regenerate' : 'generate',
        ...parsed.payload,
      },
      parsed,
    }
  }
  if (parsed.action === 'generate_shot_video') {
    return {
      endpoint: parsed.manifest.legacyEndpoint,
      payload: {
        projectId: parsed.projectId,
        draftId: parsed.draftId,
        masterRequestId: scope.masterRequestId,
        sequenceAnimaticMode: 'shot_video',
        storyboardBlockId: scope.storyboardBlockId,
        shotId: scope.shotId,
        ...parsed.payload,
      },
      parsed,
    }
  }
  if (parsed.action === 'revise_shot') {
    return {
      endpoint: parsed.manifest.legacyEndpoint,
      payload: {
        projectId: parsed.projectId,
        draftId: parsed.draftId,
        masterRequestId: scope.masterRequestId,
        storyboardBlockId: scope.storyboardBlockId,
        shotId: scope.shotId,
        ...parsed.payload,
      },
      parsed,
    }
  }
  throw new Error(`Workflow command route is not implemented yet: ${parsed.family}:${parsed.action}`)
}
