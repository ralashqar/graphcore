import { z } from 'zod'

export const workflowCommandFamilySchema = z.enum(['sequence_animatic', 'scene_board'])

export const workflowCommandActionSchema = z.enum([
  'prepare_scene_board',
  'regenerate_scene_board_zone',
  'generate_coverage_intents',
  'generate_spot_angle_coverage',
  'generate_zone_coverage_grids',
  'generate_coverage_anchors',
  'prepare_storyboard_blocks',
  'prepare_scene_shot_plans',
  'prepare_continuity_workflow',
  'prepare_shot_production_graph',
  'generate_keyframes',
  'generate_shot_video',
  'revise_shot',
  'generate_continuity_assets',
])

export const workflowCommandScopeSchema = z.object({
  masterRequestId: z.string().min(1),
  sceneId: z.string().min(1).optional(),
  sceneIds: z.array(z.string().min(1)).default([]),
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
export type ParsedWorkflowCommand = WorkflowCommand & { manifest: WorkflowCommandManifest }

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

export type WorkflowCommandTemplateCoverageInput = {
  templateKeys: Iterable<string>
  manifests?: readonly WorkflowCommandManifest[]
  families?: readonly WorkflowCommandFamily[]
  actions?: readonly WorkflowCommandAction[]
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
    action: 'generate_spot_angle_coverage',
    label: 'Generate Spot Angle Coverage',
    description: 'Generate canonical reusable camera angles for selected Scene Board spots.',
    templateKey: 'sequence_animatic_scene_board_prep',
    legacyEndpoint: 'start-scene-board-workflow-command',
    targetRole: 'scene_board_prep',
    projectionFamily: 'scene_board_prep',
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
    action: 'prepare_storyboard_blocks',
    label: 'Prepare Storyboard Blocks',
    description: 'Ensure storyboard block child workflows for a sequence animatic master request.',
    templateKey: 'sequence_animatic_storyboard_blocks',
    legacyEndpoint: 'ensure-sequence-animatic-block-workflows',
    targetRole: 'storyboard_block',
    projectionFamily: 'storyboard_block',
    defaultForceRefresh: false,
  },
  {
    family: 'sequence_animatic',
    action: 'prepare_scene_shot_plans',
    label: 'Prepare Scene Shot Plans',
    description: 'Ensure scene-scoped shot-plan child workflows for a sequence animatic master request.',
    templateKey: 'sequence_animatic_scene_shot_plans',
    legacyEndpoint: 'ensure-sequence-animatic-scene-workflows',
    targetRole: 'scene_shot_plan',
    projectionFamily: 'scene_shot_plan',
    defaultForceRefresh: false,
  },
  {
    family: 'sequence_animatic',
    action: 'prepare_continuity_workflow',
    label: 'Prepare Continuity Workflow',
    description: 'Ensure the sequence animatic continuity sidecar workflow and request.',
    templateKey: 'sequence_animatic_continuity_workflow',
    legacyEndpoint: 'ensure-sequence-animatic-continuity-workflow',
    targetRole: 'continuity_workflow',
    projectionFamily: 'continuity_workflow',
    defaultForceRefresh: false,
  },
  {
    family: 'sequence_animatic',
    action: 'prepare_shot_production_graph',
    label: 'Prepare Shot Production Graph',
    description: 'Ensure a shot-scoped production graph with coverage, continuity references, keyframe, and video-ready nodes.',
    templateKey: 'sequence_animatic_shot_production',
    legacyEndpoint: 'ensure-sequence-animatic-shot-production-graph',
    targetRole: 'shot_production',
    projectionFamily: 'shot_production',
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

export function validateWorkflowCommandTemplateCoverage(input: WorkflowCommandTemplateCoverageInput) {
  const diagnostics: string[] = []
  const templateKeys = new Set(
    Array.from(input.templateKeys)
      .map((key) => String(key ?? '').trim())
      .filter(Boolean),
  )
  const familyFilter = input.families ? new Set(input.families) : null
  const actionFilter = input.actions ? new Set(input.actions) : null
  const manifests = (input.manifests ?? workflowCommandManifests)
    .filter((manifest) => !familyFilter || familyFilter.has(manifest.family))
    .filter((manifest) => !actionFilter || actionFilter.has(manifest.action))

  if (manifests.length === 0) {
    diagnostics.push('No workflow command manifests matched the requested template coverage filters.')
  }

  for (const manifest of manifests) {
    const templateKey = manifest.templateKey.trim()
    if (!templateKey) {
      diagnostics.push(`Workflow command ${manifest.family}:${manifest.action} is missing a templateKey.`)
    } else if (!templateKeys.has(templateKey)) {
      diagnostics.push(`Workflow command ${manifest.family}:${manifest.action} references unknown template "${templateKey}".`)
    }
  }

  return diagnostics.length === 0
    ? { ok: true as const, diagnostics: [] }
    : { ok: false as const, diagnostics }
}

export function assertWorkflowCommandTemplateCoverage(input: WorkflowCommandTemplateCoverageInput) {
  const validation = validateWorkflowCommandTemplateCoverage(input)
  if (!validation.ok) throw new Error(validation.diagnostics.join('\n'))
  return validation
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
  if (action === 'generate_spot_angle_coverage') return 'generate_spot_angle_coverage'
  if (action === 'generate_zone_coverage_grids') return 'generate_zone_coverage_grids'
  if (action === 'generate_coverage_anchors') return 'generate_selected_coverage_anchors'
  return null
}

type WorkflowCommandLegacyPayloadBuilder = (parsed: ParsedWorkflowCommand) => Record<string, unknown>

function baseWorkflowCommandPayload(parsed: ParsedWorkflowCommand) {
  return {
    projectId: parsed.projectId,
    draftId: parsed.draftId,
    masterRequestId: parsed.scope.masterRequestId,
  }
}

const workflowCommandLegacyPayloadBuilders: Record<WorkflowCommandAction, WorkflowCommandLegacyPayloadBuilder> = {
  prepare_scene_board: (parsed) => {
    const action = sceneBoardLegacyActionForWorkflowCommand(parsed.action)
    if (!action) throw new Error(`Workflow command cannot be routed through the Scene Board wrapper: ${parsed.action}`)
    return {
      ...baseWorkflowCommandPayload(parsed),
      sceneId: parsed.scope.sceneId,
      action,
      setId: parsed.scope.setId ?? null,
      zoneId: parsed.scope.zoneId ?? null,
      scopeNodeId: parsed.scope.scopeNodeId ?? null,
      shotIds: parsed.scope.shotIds,
      forceRefresh: parsed.flags.forceRefresh,
      ...parsed.payload,
    }
  },
  regenerate_scene_board_zone: (parsed) => {
    const action = sceneBoardLegacyActionForWorkflowCommand(parsed.action)
    if (!action) throw new Error(`Workflow command cannot be routed through the Scene Board wrapper: ${parsed.action}`)
    return {
      ...baseWorkflowCommandPayload(parsed),
      sceneId: parsed.scope.sceneId,
      action,
      setId: parsed.scope.setId ?? null,
      zoneId: parsed.scope.zoneId ?? null,
      scopeNodeId: parsed.scope.scopeNodeId ?? null,
      shotIds: parsed.scope.shotIds,
      forceRefresh: parsed.flags.forceRefresh,
      ...parsed.payload,
    }
  },
  generate_coverage_intents: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    sceneId: parsed.scope.sceneId,
    setId: parsed.scope.setId ?? null,
    zoneId: parsed.scope.zoneId ?? null,
    shotIds: parsed.scope.shotIds,
    scopedShots: parsed.payload.scopedShots ?? [],
    forceRefresh: parsed.flags.forceRefresh,
    ...parsed.payload,
  }),
  generate_spot_angle_coverage: (parsed) => {
    const action = sceneBoardLegacyActionForWorkflowCommand(parsed.action)
    if (!action) throw new Error(`Workflow command cannot be routed through the Scene Board wrapper: ${parsed.action}`)
    return {
      ...baseWorkflowCommandPayload(parsed),
      sceneId: parsed.scope.sceneId,
      action,
      setId: parsed.scope.setId ?? null,
      zoneId: parsed.scope.zoneId ?? null,
      scopeNodeId: parsed.scope.scopeNodeId ?? null,
      shotIds: parsed.scope.shotIds,
      forceRefresh: parsed.flags.forceRefresh,
      ...parsed.payload,
    }
  },
  generate_zone_coverage_grids: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    sceneId: parsed.scope.sceneId,
    setId: parsed.scope.setId ?? null,
    zoneId: parsed.scope.zoneId ?? null,
    shotIds: parsed.scope.shotIds,
    scopedShots: parsed.payload.scopedShots ?? [],
    forceRefresh: parsed.flags.forceRefresh,
    ...parsed.payload,
  }),
  generate_coverage_anchors: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    mode: parsed.flags.forceRefresh || parsed.flags.regenerate ? 'regenerate' : 'generate',
    shotIds: parsed.scope.shotIds,
    coverageSetupIds: parsed.scope.coverageSetupIds,
    allowProvisional: parsed.flags.allowProvisional,
    ...parsed.payload,
  }),
  prepare_storyboard_blocks: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    sequenceAnimaticMode: 'storyboard_blocks',
    ...parsed.payload,
  }),
  prepare_scene_shot_plans: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    sceneIds: parsed.scope.sceneIds,
    startSceneId: parsed.payload.startSceneId ?? parsed.scope.sceneId,
    ...parsed.payload,
  }),
  prepare_continuity_workflow: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    ...parsed.payload,
  }),
  prepare_shot_production_graph: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    shotId: parsed.scope.shotId,
    coverageSetupId: parsed.scope.coverageSetupIds[0],
    forceRefresh: parsed.flags.forceRefresh,
    allowProvisional: parsed.flags.allowProvisional,
    ...parsed.payload,
  }),
  generate_keyframes: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    mode: parsed.flags.forceRefresh || parsed.flags.regenerate ? 'regenerate' : 'generate',
    shotIds: parsed.scope.shotIds,
    coverageSetupIds: parsed.scope.coverageSetupIds,
    allowProvisional: parsed.flags.allowProvisional,
    ...parsed.payload,
  }),
  generate_shot_video: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    sequenceAnimaticMode: 'shot_video',
    storyboardBlockId: parsed.scope.storyboardBlockId,
    shotId: parsed.scope.shotId,
    ...parsed.payload,
  }),
  revise_shot: (parsed) => ({
    ...baseWorkflowCommandPayload(parsed),
    storyboardBlockId: parsed.scope.storyboardBlockId,
    shotId: parsed.scope.shotId,
    ...parsed.payload,
  }),
  generate_continuity_assets: (parsed) => {
    const nodeId = parsed.scope.nodeIds[0] ?? ''
    return {
      ...baseWorkflowCommandPayload(parsed),
      nodeId,
      nodeIds: parsed.scope.nodeIds,
      mode: parsed.flags.forceRefresh || parsed.flags.regenerate ? 'regenerate' : 'generate',
      ...parsed.payload,
    }
  },
}

export function assertWorkflowCommandRouteCoverage() {
  const schemaActions = workflowCommandActionSchema.options
  const manifestActionCounts = new Map<WorkflowCommandAction, number>()
  for (const manifest of workflowCommandManifests) {
    manifestActionCounts.set(manifest.action, (manifestActionCounts.get(manifest.action) ?? 0) + 1)
  }

  const duplicateManifestActions = [...manifestActionCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([action]) => action)
  if (duplicateManifestActions.length > 0) {
    throw new Error(`Duplicate workflow command manifest action(s): ${duplicateManifestActions.join(', ')}`)
  }

  const missingManifests = schemaActions
    .filter((action) => !manifestActionCounts.has(action))
  if (missingManifests.length > 0) {
    throw new Error(`Missing workflow command manifest(s): ${missingManifests.join(', ')}`)
  }

  const missingBuilders = workflowCommandManifests
    .filter((manifest) => !workflowCommandLegacyPayloadBuilders[manifest.action])
    .map((manifest) => `${manifest.family}:${manifest.action}`)
  if (missingBuilders.length > 0) {
    throw new Error(`Missing workflow command route builder(s): ${missingBuilders.join(', ')}`)
  }

  const knownActions = new Set(schemaActions)
  const extraBuilders = Object.keys(workflowCommandLegacyPayloadBuilders)
    .filter((action) => !knownActions.has(action as WorkflowCommandAction))
  if (extraBuilders.length > 0) {
    throw new Error(`Unknown workflow command route builder(s): ${extraBuilders.join(', ')}`)
  }
}

export function legacyPayloadForWorkflowCommand(value: unknown) {
  const parsed = parseWorkflowCommand(value)
  const builder = workflowCommandLegacyPayloadBuilders[parsed.action]
  if (!builder) throw new Error(`Workflow command route is not implemented yet: ${parsed.family}:${parsed.action}`)
  return {
    endpoint: parsed.manifest.legacyEndpoint,
    payload: builder(parsed),
    parsed,
  }
}
