import { z } from 'zod'

import {
  cinematicV2SceneLayoutPlanSchema,
  cinematicV2SceneStateSchema,
  cinematicV2ShotPlanSchema,
  providerSafeCinematicV2DurationSeconds,
  type CinematicV2SceneLayoutPlan,
  type CinematicV2SceneState,
  type CinematicV2ShotPlan,
} from './cinematics.ts'
import {
  hashOutputWorkflowValue,
  type OutputWorkflowNode,
} from './outputWorkflow.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const cinematicDirectorNoteScopeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('shot'),
    shotId: z.string().min(1),
  }),
  z.object({
    type: z.literal('shot_range'),
    shotIds: z.array(z.string().min(1)).min(1).max(20),
  }),
  z.object({
    type: z.literal('scene'),
  }),
])

const shotPatchSchema = z.object({
  title: z.string().max(160).optional(),
  purpose: z.enum([
    'establishing',
    'character_intro',
    'dialogue',
    'reaction',
    'action',
    'impact',
    'insert',
    'transition',
    'closing',
  ]).optional(),
  editorialDurationSeconds: z.number().positive().max(8).optional(),
  providerDurationSeconds: z.number().int().min(4).max(15).optional(),
  description: z.string().max(2000).optional(),
  action: z.string().max(1600).optional(),
  visibleCharacterRefIds: z.array(z.string()).max(12).optional(),
  speakerRefIds: z.array(z.string()).max(12).optional(),
  locationRefId: z.string().nullable().optional(),
  propRefIds: z.array(z.string()).max(12).optional(),
  continuityInputs: z.array(z.string()).max(16).optional(),
  camera: z.object({
    framing: z.string().max(400).optional(),
    angle: z.string().max(400).optional(),
    lens: z.string().max(400).optional(),
    movement: z.string().max(400).optional(),
    screenDirectionRule: z.string().max(600).optional(),
  }).strict().optional(),
  requiresLipSync: z.boolean().optional(),
}).strict()

export const cinematicDirectorPatchOperationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('update_shot'),
    shotId: z.string().min(1),
    set: shotPatchSchema,
    rationale: z.string().max(1000).default(''),
  }).strict(),
  z.object({
    op: z.literal('adjust_timing'),
    shotId: z.string().min(1),
    editorialDurationSeconds: z.number().positive().max(8),
    rationale: z.string().max(1000).default(''),
  }).strict(),
  z.object({
    op: z.literal('update_scene_state'),
    set: looseRecordSchema,
    rationale: z.string().max(1000).default(''),
  }).strict(),
  z.object({
    op: z.literal('update_layout_plan'),
    set: looseRecordSchema,
    rationale: z.string().max(1000).default(''),
  }).strict(),
  z.object({
    op: z.literal('mark_regenerate'),
    shotIds: z.array(z.string()).default([]),
    level: z.enum(['shot_keyframe', 'storyboard', 'timeline', 'scene']).default('shot_keyframe'),
    rationale: z.string().max(1000).default(''),
  }).strict(),
])

export const cinematicDirectorRegenerationPlanSchema = z.object({
  riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
  affectedShotIds: z.array(z.string()).default([]),
  dirtyNodeKeys: z.array(z.string()).default([]),
  targetNodeKeys: z.array(z.string()).default([]),
  forceNodeKeys: z.array(z.string()).default([]),
  summary: z.string().default(''),
  requiresSceneReplan: z.boolean().default(false),
})

export const cinematicDirectorPatchPreviewSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['preview', 'requires_scene_replan']).default('preview'),
  userNote: z.string().min(1),
  scope: cinematicDirectorNoteScopeSchema,
  summary: z.string().default(''),
  riskLevel: z.enum(['low', 'medium', 'high']).default('low'),
  operations: z.array(cinematicDirectorPatchOperationSchema).default([]),
  regenerationPlan: cinematicDirectorRegenerationPlanSchema,
  inverseOperations: z.array(cinematicDirectorPatchOperationSchema).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export const cinematicDirectorNotePreviewRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  workflowId: z.string().min(1),
  runId: z.string().min(1).nullable().optional(),
  note: z.string().min(1).max(4000),
  scope: cinematicDirectorNoteScopeSchema,
}).strict()

export const cinematicDirectorNotePreviewResponseSchema = z.object({
  ok: z.literal(true),
  preview: cinematicDirectorPatchPreviewSchema,
  aiUsage: looseRecordSchema.nullable().default(null),
})

export const cinematicDirectorPatchApplyRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  workflowId: z.string().min(1),
  runId: z.string().min(1).nullable().optional(),
  preview: cinematicDirectorPatchPreviewSchema,
  startRegeneration: z.boolean().default(false),
}).strict()

export const cinematicDirectorPatchApplyResponseSchema = z.object({
  ok: z.literal(true),
  preview: cinematicDirectorPatchPreviewSchema,
  versionId: z.string(),
  workflow: looseRecordSchema,
  nodes: z.array(looseRecordSchema).default([]),
  regenerationRunRequest: looseRecordSchema.nullable().default(null),
})

export type CinematicDirectorNoteScope = z.infer<typeof cinematicDirectorNoteScopeSchema>
export type CinematicDirectorPatchOperation = z.infer<typeof cinematicDirectorPatchOperationSchema>
export type CinematicDirectorPatchPreview = z.infer<typeof cinematicDirectorPatchPreviewSchema>
export type CinematicDirectorRegenerationPlan = z.infer<typeof cinematicDirectorRegenerationPlanSchema>
export type CinematicDirectorNotePreviewRequest = z.infer<typeof cinematicDirectorNotePreviewRequestSchema>
export type CinematicDirectorNotePreviewResponse = z.infer<typeof cinematicDirectorNotePreviewResponseSchema>
export type CinematicDirectorPatchApplyRequest = z.infer<typeof cinematicDirectorPatchApplyRequestSchema>
export type CinematicDirectorPatchApplyResponse = z.infer<typeof cinematicDirectorPatchApplyResponseSchema>

function uniqueStrings(values: Array<string | null | undefined>) {
  return values.filter((value, index, items): value is string => Boolean(value) && items.indexOf(value) === index)
}

function shotNodeSuffix(shot: { index: number }) {
  return String(shot.index).padStart(3, '0')
}

function nodeExists(nodes: OutputWorkflowNode[], key: string) {
  return nodes.some((node) => node.key === key)
}

function shotBranchKeysForShot(shot: { index: number }, nodes: OutputWorkflowNode[]) {
  const baseKey = `cinematic_v2_shot_${shotNodeSuffix(shot)}`
  return [
    `${baseKey}_asset_pack`,
    `${baseKey}_keyframe_prompt`,
    `${baseKey}_keyframe`,
    `${baseKey}_video_prompt`,
    `${baseKey}_video`,
  ].filter((key) => nodeExists(nodes, key))
}

function shotKeyframeNodeKey(shot: { index: number }, nodes: OutputWorkflowNode[]) {
  const key = `cinematic_v2_shot_${shotNodeSuffix(shot)}_keyframe`
  return nodeExists(nodes, key) ? key : null
}

function directScopeShotIds(scope: CinematicDirectorNoteScope) {
  if (scope.type === 'shot') return [scope.shotId]
  if (scope.type === 'shot_range') return scope.shotIds
  return []
}

function operationShotIds(operation: CinematicDirectorPatchOperation) {
  if (operation.op === 'update_shot' || operation.op === 'adjust_timing') return [operation.shotId]
  if (operation.op === 'mark_regenerate') return operation.shotIds
  return []
}

function operationIsSceneWide(operation: CinematicDirectorPatchOperation) {
  return operation.op === 'update_scene_state'
    || operation.op === 'update_layout_plan'
    || (operation.op === 'mark_regenerate' && ['storyboard', 'scene'].includes(operation.level))
}

export function validateCinematicDirectorScope(input: {
  scope: CinematicDirectorNoteScope
  shotPlan: CinematicV2ShotPlan
}) {
  const shotIds = new Set(input.shotPlan.shots.map((shot) => shot.id))
  const requestedShotIds = directScopeShotIds(input.scope)
  return requestedShotIds
    .filter((shotId) => !shotIds.has(shotId))
    .map((shotId) => `Unknown cinematic shot id "${shotId}".`)
}

export function deriveCinematicDirectorRegenerationPlan(input: {
  scope: CinematicDirectorNoteScope
  operations: CinematicDirectorPatchOperation[]
  shotPlan: CinematicV2ShotPlan
  nodes: OutputWorkflowNode[]
}): CinematicDirectorRegenerationPlan {
  const sceneWide = input.scope.type === 'scene' || input.operations.some(operationIsSceneWide)
  const shotIds = sceneWide
    ? input.shotPlan.shots.map((shot) => shot.id)
    : uniqueStrings([
      ...directScopeShotIds(input.scope),
      ...input.operations.flatMap(operationShotIds),
    ])
  const affectedShots = input.shotPlan.shots.filter((shot) => shotIds.includes(shot.id))
  const shotDirtyKeys = affectedShots.flatMap((shot) => shotBranchKeysForShot(shot, input.nodes))
  const keyframeTargets = affectedShots.map((shot) => shotKeyframeNodeKey(shot, input.nodes)).filter((key): key is string => Boolean(key))
  const sceneDirtyKeys = sceneWide
    ? [
      'cinematic_v2_storyboard_prompt',
      'cinematic_v2_storyboard_sheet',
      'cinematic_v2_panel_extract',
    ].filter((key) => nodeExists(input.nodes, key))
    : []
  const timelineKey = nodeExists(input.nodes, 'cinematic_v2_timeline_assemble') ? 'cinematic_v2_timeline_assemble' : null
  const dirtyNodeKeys = uniqueStrings([
    ...sceneDirtyKeys,
    ...shotDirtyKeys,
    timelineKey,
  ])
  const targetNodeKeys = uniqueStrings([
    ...(sceneWide && nodeExists(input.nodes, 'cinematic_v2_panel_extract') ? ['cinematic_v2_panel_extract'] : []),
    ...keyframeTargets,
    timelineKey,
  ])
  const forceNodeKeys = uniqueStrings([
    ...(sceneWide ? sceneDirtyKeys : []),
    ...affectedShots.flatMap((shot) => {
      const baseKey = `cinematic_v2_shot_${shotNodeSuffix(shot)}`
      return [`${baseKey}_asset_pack`, `${baseKey}_keyframe_prompt`, `${baseKey}_keyframe`]
    }).filter((key) => nodeExists(input.nodes, key)),
    timelineKey,
  ])
  const riskLevel = sceneWide ? 'high' : affectedShots.length > 1 ? 'medium' : 'low'
  const summary = sceneWide
    ? `Updates scene-wide direction and regenerates storyboard/panels plus ${affectedShots.length} shot keyframe${affectedShots.length === 1 ? '' : 's'}.`
    : `Updates ${affectedShots.length} shot${affectedShots.length === 1 ? '' : 's'} and regenerates affected keyframe${affectedShots.length === 1 ? '' : 's'}.`
  return cinematicDirectorRegenerationPlanSchema.parse({
    riskLevel,
    affectedShotIds: affectedShots.map((shot) => shot.id),
    dirtyNodeKeys,
    targetNodeKeys,
    forceNodeKeys,
    summary,
    requiresSceneReplan: false,
  })
}

function shallowMergeRecord(base: Record<string, unknown>, patch: Record<string, unknown>) {
  return {
    ...base,
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
  }
}

function mergeCamera(base: Record<string, unknown>, patch: unknown) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base
  return shallowMergeRecord(base, patch as Record<string, unknown>)
}

function applyShotPatch(shot: Record<string, unknown>, patch: Record<string, unknown>) {
  const next = { ...shot }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (key === 'camera') {
      next.camera = mergeCamera(
        shot.camera && typeof shot.camera === 'object' && !Array.isArray(shot.camera) ? shot.camera as Record<string, unknown> : {},
        value,
      )
    } else if (key === 'editorialDurationSeconds') {
      next.editorialDurationSeconds = value
      next.providerDurationSeconds = typeof patch.providerDurationSeconds === 'number'
        ? patch.providerDurationSeconds
        : providerSafeCinematicV2DurationSeconds(Number(value))
    } else {
      next[key] = value
    }
  }
  return next
}

function inverseForShotPatch(shot: Record<string, unknown>, patch: Record<string, unknown>) {
  const inverse: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) {
    if (key === 'camera') {
      const cameraPatch = patch.camera && typeof patch.camera === 'object' && !Array.isArray(patch.camera)
        ? patch.camera as Record<string, unknown>
        : {}
      const priorCamera = shot.camera && typeof shot.camera === 'object' && !Array.isArray(shot.camera)
        ? shot.camera as Record<string, unknown>
        : {}
      inverse.camera = Object.fromEntries(Object.keys(cameraPatch).map((field) => [field, priorCamera[field] ?? '']))
    } else if (key === 'locationRefId') {
      inverse.locationRefId = typeof shot.locationRefId === 'string' ? shot.locationRefId : null
    } else if (['visibleCharacterRefIds', 'speakerRefIds', 'propRefIds', 'continuityInputs'].includes(key)) {
      inverse[key] = Array.isArray(shot[key]) ? [...shot[key] as unknown[]] : []
    } else if (key === 'requiresLipSync') {
      inverse.requiresLipSync = Boolean(shot.requiresLipSync)
    } else if (key === 'editorialDurationSeconds') {
      inverse.editorialDurationSeconds = typeof shot.editorialDurationSeconds === 'number' ? shot.editorialDurationSeconds : 2
    } else if (key === 'providerDurationSeconds') {
      inverse.providerDurationSeconds = typeof shot.providerDurationSeconds === 'number' ? shot.providerDurationSeconds : 4
    } else {
      inverse[key] = typeof shot[key] === 'string' ? shot[key] : ''
    }
  }
  return inverse
}

export function applyCinematicDirectorPatch(input: {
  shotPlan: unknown
  sceneState?: unknown
  layoutPlan?: unknown
  operations: CinematicDirectorPatchOperation[]
}) {
  let nextShotPlan = cinematicV2ShotPlanSchema.parse(input.shotPlan)
  let nextSceneState = cinematicV2SceneStateSchema.safeParse(input.sceneState).success
    ? cinematicV2SceneStateSchema.parse(input.sceneState)
    : null
  let nextLayoutPlan = cinematicV2SceneLayoutPlanSchema.safeParse(input.layoutPlan).success
    ? cinematicV2SceneLayoutPlanSchema.parse(input.layoutPlan)
    : null
  const inverseOperations: CinematicDirectorPatchOperation[] = []
  const diagnostics: string[] = []

  for (const operation of input.operations) {
    if (operation.op === 'update_shot') {
      const shot = nextShotPlan.shots.find((entry) => entry.id === operation.shotId)
      if (!shot) {
        diagnostics.push(`Skipped update for unknown shot "${operation.shotId}".`)
        continue
      }
      inverseOperations.unshift({
        op: 'update_shot',
        shotId: operation.shotId,
        set: inverseForShotPatch(shot as unknown as Record<string, unknown>, operation.set as Record<string, unknown>),
        rationale: 'Undo director note shot update.',
      })
      nextShotPlan = {
        ...nextShotPlan,
        shots: nextShotPlan.shots.map((entry) => entry.id === operation.shotId
          ? cinematicV2ShotPlanSchema.shape.shots.element.parse(applyShotPatch(entry as unknown as Record<string, unknown>, operation.set as Record<string, unknown>))
          : entry),
      }
    } else if (operation.op === 'adjust_timing') {
      const shot = nextShotPlan.shots.find((entry) => entry.id === operation.shotId)
      if (!shot) {
        diagnostics.push(`Skipped timing update for unknown shot "${operation.shotId}".`)
        continue
      }
      inverseOperations.unshift({
        op: 'adjust_timing',
        shotId: operation.shotId,
        editorialDurationSeconds: shot.editorialDurationSeconds,
        rationale: 'Undo director note timing update.',
      })
      nextShotPlan = {
        ...nextShotPlan,
        shots: nextShotPlan.shots.map((entry) => entry.id === operation.shotId
          ? {
              ...entry,
              editorialDurationSeconds: operation.editorialDurationSeconds,
              providerDurationSeconds: providerSafeCinematicV2DurationSeconds(operation.editorialDurationSeconds),
            }
          : entry),
      }
    } else if (operation.op === 'update_scene_state') {
      if (!nextSceneState) {
        diagnostics.push('Skipped scene-state update because no valid scene state exists.')
        continue
      }
      inverseOperations.unshift({
        op: 'update_scene_state',
        set: Object.fromEntries(Object.keys(operation.set).map((key) => [key, (nextSceneState as unknown as Record<string, unknown>)[key] ?? null])),
        rationale: 'Undo director note scene-state update.',
      })
      nextSceneState = cinematicV2SceneStateSchema.parse(shallowMergeRecord(nextSceneState as unknown as Record<string, unknown>, operation.set))
    } else if (operation.op === 'update_layout_plan') {
      if (!nextLayoutPlan) {
        diagnostics.push('Skipped layout-plan update because no valid layout plan exists.')
        continue
      }
      inverseOperations.unshift({
        op: 'update_layout_plan',
        set: Object.fromEntries(Object.keys(operation.set).map((key) => [key, (nextLayoutPlan as unknown as Record<string, unknown>)[key] ?? null])),
        rationale: 'Undo director note layout update.',
      })
      nextLayoutPlan = cinematicV2SceneLayoutPlanSchema.parse(shallowMergeRecord(nextLayoutPlan as unknown as Record<string, unknown>, operation.set))
    }
  }

  nextShotPlan = cinematicV2ShotPlanSchema.parse({
    ...nextShotPlan,
    totalEditorialDurationSeconds: Math.max(0.1, nextShotPlan.shots.reduce((sum, shot) => sum + shot.editorialDurationSeconds, 0)),
  })

  return {
    shotPlan: nextShotPlan,
    sceneState: nextSceneState,
    layoutPlan: nextLayoutPlan,
    inverseOperations,
    diagnostics,
  }
}

export function buildFallbackCinematicDirectorPatch(input: {
  note: string
  scope: CinematicDirectorNoteScope
  shotPlan: CinematicV2ShotPlan
}) {
  const lowerNote = input.note.toLowerCase()
  const shotIds = input.scope.type === 'scene'
    ? input.shotPlan.shots.map((shot) => shot.id)
    : directScopeShotIds(input.scope)
  const operations: CinematicDirectorPatchOperation[] = []
  if (input.scope.type === 'scene') {
    operations.push({
      op: 'update_scene_state',
      set: lowerNote.includes('night')
        ? { timeOfDay: 'night', mood: input.note }
        : { mood: input.note, atmosphere: input.note },
      rationale: 'Apply the scene-level director note as scene state.',
    })
    operations.push({ op: 'mark_regenerate', shotIds, level: 'storyboard', rationale: 'Scene-level note affects storyboard continuity.' })
  } else {
    for (const shotId of shotIds) {
      const shot = input.shotPlan.shots.find((entry) => entry.id === shotId)
      if (!shot) continue
      const camera: Record<string, string> = {}
      if (lowerNote.includes('lower') || lowerNote.includes('low angle')) camera.angle = 'low angle, more imposing'
      if (lowerNote.includes('closer') || lowerNote.includes('close')) camera.framing = 'closer framing'
      if (lowerNote.includes('long lens') || lowerNote.includes('compressed')) camera.lens = 'compressed telephoto lens'
      const duration = lowerNote.includes('hold') || lowerNote.includes('longer') || lowerNote.includes('slower')
        ? Math.min(8, Math.max(shot.editorialDurationSeconds + 1, shot.editorialDurationSeconds * 1.25))
        : null
      operations.push({
        op: 'update_shot',
        shotId,
        set: {
          ...(Object.keys(camera).length > 0 ? { camera } : {}),
          ...(duration ? { editorialDurationSeconds: duration } : {}),
          description: `${shot.description || shot.title} Director note: ${input.note}`,
          action: shot.action ? `${shot.action} ${input.note}` : input.note,
        },
        rationale: 'Apply the director note to structured shot direction.',
      })
      operations.push({ op: 'mark_regenerate', shotIds: [shotId], level: 'shot_keyframe', rationale: 'Shot direction changed.' })
    }
  }
  return operations
}

export function buildCinematicDirectorPatchPreview(input: {
  note: string
  scope: CinematicDirectorNoteScope
  shotPlan: CinematicV2ShotPlan
  sceneState?: CinematicV2SceneState | null
  layoutPlan?: CinematicV2SceneLayoutPlan | null
  nodes: OutputWorkflowNode[]
  operations: CinematicDirectorPatchOperation[]
  status?: 'preview' | 'requires_scene_replan'
  summary?: string
  diagnostics?: string[]
}) {
  const scopeDiagnostics = validateCinematicDirectorScope({ scope: input.scope, shotPlan: input.shotPlan })
  const operations = scopeDiagnostics.length > 0 ? [] : input.operations
  const regenerationPlan = deriveCinematicDirectorRegenerationPlan({
    scope: input.scope,
    operations,
    shotPlan: input.shotPlan,
    nodes: input.nodes,
  })
  const previewStatus = input.status ?? 'preview'
  const finalRegenerationPlan = previewStatus === 'requires_scene_replan'
    ? cinematicDirectorRegenerationPlanSchema.parse({
      ...regenerationPlan,
      riskLevel: 'high',
      requiresSceneReplan: true,
      summary: 'This note requires a broader scene replan before targeted regeneration.',
      targetNodeKeys: [],
      forceNodeKeys: [],
    })
    : regenerationPlan
  const applied = applyCinematicDirectorPatch({
    shotPlan: input.shotPlan,
    sceneState: input.sceneState ?? undefined,
    layoutPlan: input.layoutPlan ?? undefined,
    operations,
  })
  return cinematicDirectorPatchPreviewSchema.parse({
    id: `director_${hashOutputWorkflowValue({ note: input.note, scope: input.scope, operations }).slice(0, 12)}`,
    status: previewStatus,
    userNote: input.note,
    scope: input.scope,
    summary: input.summary || finalRegenerationPlan.summary,
    riskLevel: finalRegenerationPlan.riskLevel,
    operations,
    regenerationPlan: finalRegenerationPlan,
    inverseOperations: applied.inverseOperations,
    diagnostics: [...scopeDiagnostics, ...(input.diagnostics ?? []), ...applied.diagnostics],
  })
}

export function buildCinematicDirectorRunMetadata(input: {
  preview: CinematicDirectorPatchPreview
  sourceRunId?: string | null
}) {
  return {
    runMode: 'cinematic_v2_director_note_animatic_regeneration',
    runScope: 'upstream_to_node',
    targetNodeKeys: input.preview.regenerationPlan.targetNodeKeys,
    forceNodeKeys: input.preview.regenerationPlan.forceNodeKeys,
    reuseExistingUpstreamOutputs: true,
    allowStaleUpstreamOutputs: true,
    debugSkipVideoGeneration: true,
    cinematicVideoApproved: false,
    sourceRunId: input.sourceRunId ?? null,
    directorNotePreviewId: input.preview.id,
    directorNoteVersionId: input.preview.id,
  }
}
