import { z } from 'zod'
import {
  cinematicV2ShotSchema,
} from '../../../src/domain/cinematics.ts'
import {
  sequenceAnimaticShotContinuityCoverageSetupV2Schema,
} from './output-workflow-sequence-animatic-coverage-runtime.ts'

export const sequenceAnimaticContinuityRejectedReasonSchema = z.enum([
  'existing_world_entity',
  'abstract_or_atmospheric',
  'not_visual',
  'single_use_not_story_critical',
  'too_generic',
  'low_confidence',
])

export const sequenceAnimaticContinuityPlannerAnchorSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['character', 'prop', 'location_spot', 'location_set', 'location_angle']),
  name: z.string(),
  visualBrief: z.string(),
  persistenceReason: z.string(),
  confidence: z.number().min(0).max(1),
  shotIds: z.array(z.string()).default([]),
  storyboardBlockIds: z.array(z.string()).default([]),
  sourceEvidence: z.array(z.string()).default([]),
  existingWorldEntityMatch: z.string().nullable().default(null),
  rejectionRisk: z.string().default(''),
  baseLocationRefId: z.string().nullable().default(null),
  setId: z.string().nullable().default(null),
  angleId: z.string().nullable().default(null),
  connectedTo: z.array(z.string()).default([]),
  visibleFrom: z.array(z.string()).default([]),
  entryFrom: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityLocationSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseLocationRefId: z.string().nullable().default(null),
  visualBrief: z.string(),
  persistenceReason: z.string(),
  shotIds: z.array(z.string()).default([]),
  storyboardBlockIds: z.array(z.string()).default([]),
  connectedSetIds: z.array(z.string()).default([]),
  entrances: z.array(z.string()).default([]),
  landmarks: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityLocationAngleSchema = z.object({
  id: z.string(),
  setId: z.string(),
  name: z.string(),
  visualBrief: z.string(),
  framing: z.string().default(''),
  screenDirectionRule: z.string().default(''),
  visibleLandmarks: z.array(z.string()).default([]),
  lightingDirection: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  storyboardBlockIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuitySceneGraphSchema = z.object({
  nodes: z.array(z.object({
    id: z.string(),
    type: z.enum(['location_set', 'location_angle']),
    name: z.string(),
  })).default([]),
  edges: z.array(z.object({
    sourceId: z.string(),
    targetId: z.string(),
    relationship: z.enum(['connected_to', 'visible_from', 'entrance_to', 'adjacent_to', 'same_space_angle']),
    evidence: z.string().default(''),
  })).default([]),
})

export const sequenceAnimaticContinuityGraphEdgeSchema = z.object({
  sourceId: z.string(),
  targetId: z.string(),
  relationship: z.enum([
    'connected_to',
    'adjacent_to',
    'entrance_to',
    'visible_from',
    'same_space_angle',
    'contains',
    'camera_faces',
    'faces',
    'opposes',
    'above_below',
    'left_of',
    'right_of',
    'near',
    'occludes',
    'spot_to_viewpoint',
    'zone_to_viewpoint',
    'set_to_viewpoint',
  ]),
  evidence: z.string().default(''),
  direction: z.string().default(''),
  screenDirection: z.string().default(''),
})

export const sequenceAnimaticContinuityWorldLocationRefSchema = z.object({
  id: z.string(),
  name: z.string().default(''),
  summary: z.string().default(''),
  visualSummary: z.string().default(''),
})

export const sequenceAnimaticContinuityGraphSetSchema = z.object({
  id: z.string(),
  worldLocationRefId: z.string().nullable().default(null),
  name: z.string(),
  visualBrief: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  storyboardBlockIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityGraphZoneSchema = z.object({
  id: z.string(),
  setId: z.string(),
  worldLocationRefId: z.string().nullable().default(null),
  name: z.string(),
  visualBrief: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  storyboardBlockIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityGraphSpotSchema = z.object({
  id: z.string(),
  zoneId: z.string().default(''),
  setId: z.string(),
  worldLocationRefId: z.string().nullable().default(null),
  name: z.string(),
  visualBrief: z.string().default(''),
  landmarks: z.array(z.string()).default([]),
  shotIds: z.array(z.string()).default([]),
  storyboardBlockIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityGraphAngleSchema = z.object({
  id: z.string(),
  setId: z.string(),
  zoneId: z.string().default(''),
  spotIds: z.array(z.string()).default([]),
  worldLocationRefId: z.string().nullable().default(null),
  name: z.string(),
  visualBrief: z.string().default(''),
  framing: z.string().default(''),
  cameraPosition: z.string().default(''),
  facingDirection: z.string().default(''),
  subjectPosition: z.string().default(''),
  visibleLandmarks: z.array(z.string()).default([]),
  lightingDirection: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  storyboardBlockIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityShotBindingSchema = z.object({
  shotId: z.string(),
  storyboardBlockId: z.string().default(''),
  worldLocationRefId: z.string().nullable().default(null),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  primarySpotId: z.string().default(''),
  spotIds: z.array(z.string()).default([]),
  viewpointId: z.string().default(''),
  angleId: z.string().default(''),
  characterAnchorIds: z.array(z.string()).default([]),
  propAnchorIds: z.array(z.string()).default([]),
  assetAnchorIds: z.array(z.string()).default([]),
  spatialNodeIds: z.array(z.string()).default([]),
  continuityAnchorIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticContinuityRejectedCandidateSchema = z.object({
  name: z.string(),
  type: z.enum(['character', 'prop', 'location_spot', 'location_set', 'location_angle', 'unknown']).default('unknown'),
  reason: sequenceAnimaticContinuityRejectedReasonSchema,
  sourceEvidence: z.array(z.string()).default([]),
  shotIds: z.array(z.string()).default([]),
  existingWorldEntityMatch: z.string().nullable().default(null),
})

export const sequenceAnimaticContinuityGraphV2Schema = z.object({
  version: z.literal('sequence_animatic_continuity_graph_v2').default('sequence_animatic_continuity_graph_v2'),
  planningMode: z.enum(['block_graph_v2', 'deterministic_fallback']).default('block_graph_v2'),
  worldLocationRefs: z.array(sequenceAnimaticContinuityWorldLocationRefSchema).default([]),
  locationSets: z.array(sequenceAnimaticContinuityGraphSetSchema).default([]),
  zones: z.array(sequenceAnimaticContinuityGraphZoneSchema).default([]),
  spots: z.array(sequenceAnimaticContinuityGraphSpotSchema).default([]),
  viewpoints: z.array(sequenceAnimaticContinuityGraphAngleSchema).default([]),
  angles: z.array(sequenceAnimaticContinuityGraphAngleSchema).default([]),
  edges: z.array(sequenceAnimaticContinuityGraphEdgeSchema).default([]),
  shotBindings: z.record(z.string(), sequenceAnimaticContinuityShotBindingSchema).default({}),
  assetAnchors: z.array(sequenceAnimaticContinuityPlannerAnchorSchema).default([]),
  rejectedCandidates: z.array(sequenceAnimaticContinuityRejectedCandidateSchema).default([]),
  blockSummaries: z.array(z.object({
    blockId: z.string(),
    summary: z.string().default(''),
    status: z.enum(['planned', 'fallback', 'failed']).default('planned'),
  })).default([]),
  warnings: z.array(z.string()).default([]),
  diagnostics: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuityDialogueLineV2Schema = z.object({
  speakerRefId: z.string().min(1),
  speakerName: z.string().default(''),
  text: z.preprocess(
    (value) => typeof value === 'string' && value.length > 140 ? `${value.slice(0, 137).trimEnd()}...` : value,
    z.string().min(1).max(140),
  ),
  emotion: z.string().default(''),
  delivery: z.string().default(''),
  subtext: z.string().default(''),
  startSeconds: z.number().nonnegative().nullable().default(null),
  endSeconds: z.number().nonnegative().nullable().default(null),
})

export const sequenceAnimaticShotContinuityMaxDurationSeconds = 10
export const sequenceAnimaticShotContinuityPreferredDurationSeconds = 6
export const sequenceAnimaticShotContinuityMaxDialogueLines = 2
export const sequenceAnimaticShotContinuityMaxDialogueCharacters = 220
export const sequenceAnimaticShotContinuityMaxShotCount = 150
export const sequenceAnimaticShotContinuityMaxTotalDurationSeconds =
  sequenceAnimaticShotContinuityMaxShotCount * sequenceAnimaticShotContinuityMaxDurationSeconds

export const sequenceAnimaticShotContinuityPerformanceBeatV2Schema = z.object({
  characterRefId: z.string().min(1),
  emotion: z.string().default(''),
  valence: z.number().min(-1).max(1).default(0),
  arousal: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(0.5),
  dominance: z.number().min(0).max(1).default(0.5),
  bodyLanguage: z.string().default(''),
  facialExpression: z.string().default(''),
  gaze: z.string().default(''),
  gesture: z.string().default(''),
  voiceEnergy: z.string().default(''),
})

export const sequenceAnimaticShotContinuityRefsV2Schema = z.object({
  visibleCharacterRefIds: z.array(z.string()).default([]),
  speakerRefIds: z.array(z.string()).default([]),
  propRefIds: z.array(z.string()).default([]),
  locationRefIds: z.array(z.string()).default([]),
  localReferenceIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuitySceneBindingV2Schema = z.object({
  worldLocationRefId: z.string().default(''),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  primarySpotId: z.string().default(''),
  spotIds: z.array(z.string()).default([]),
  viewpointId: z.string().default(''),
  angleId: z.string().default(''),
  characterAnchorIds: z.array(z.string()).default([]),
  propAnchorIds: z.array(z.string()).default([]),
  assetAnchorIds: z.array(z.string()).default([]),
  localReferenceIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuityCoverageLinkV2Schema = z.object({
  mode: z.enum(['same_setup', 'reverse_angle', 'blocking_change', 'match_action', 'new_setup', 'insert_cutaway', 'new_scene']).default('new_setup'),
  fromShotId: z.string().default(''),
  fromSetupId: z.string().default(''),
  description: z.string().default(''),
})

export const sequenceAnimaticShotContinuityShotV2Schema = z.object({
  id: z.string().min(1),
  index: z.number().int().positive(),
  blockId: z.string().min(1),
  title: z.string().default(''),
  durationSeconds: z.number().positive().max(sequenceAnimaticShotContinuityMaxDurationSeconds).default(3),
  action: z.string().min(1),
  camera: z.object({
    framing: z.string().default(''),
    angle: z.string().default(''),
    lens: z.string().default(''),
    movement: z.string().default(''),
    screenDirectionRule: z.string().default(''),
  }).default({ framing: '', angle: '', lens: '', movement: '', screenDirectionRule: '' }),
  lighting: z.string().default(''),
  dialogue: z.array(sequenceAnimaticShotContinuityDialogueLineV2Schema).max(sequenceAnimaticShotContinuityMaxDialogueLines).default([]),
  performance: z.array(sequenceAnimaticShotContinuityPerformanceBeatV2Schema).default([]),
  refs: sequenceAnimaticShotContinuityRefsV2Schema.default({
    visibleCharacterRefIds: [],
    speakerRefIds: [],
    propRefIds: [],
    locationRefIds: [],
    localReferenceIds: [],
  }),
  sceneBinding: sequenceAnimaticShotContinuitySceneBindingV2Schema,
  coverageSetupId: z.string().default(''),
  coverage_setup_id: z.string().default(''),
  continuityLink: sequenceAnimaticShotContinuityCoverageLinkV2Schema.default({ mode: 'new_setup', fromShotId: '', fromSetupId: '', description: '' }),
  continuity_link: sequenceAnimaticShotContinuityCoverageLinkV2Schema.optional(),
}).superRefine((shot, context) => {
  const dialogueCharacterCount = shot.dialogue.reduce((total, line) => total + line.text.trim().length, 0)
  if (dialogueCharacterCount > sequenceAnimaticShotContinuityMaxDialogueCharacters) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dialogue'],
      message: `Shot dialogue is too dense (${dialogueCharacterCount} chars); split the exchange into more shots.`,
    })
  }
  for (const [index, line] of shot.dialogue.entries()) {
    const startSeconds = typeof line.startSeconds === 'number' ? line.startSeconds : null
    const endSeconds = typeof line.endSeconds === 'number' ? line.endSeconds : null
    if (endSeconds !== null && endSeconds > shot.durationSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dialogue', index, 'endSeconds'],
        message: 'Dialogue timing cannot exceed shot durationSeconds.',
      })
    }
    if (startSeconds !== null && endSeconds !== null && endSeconds < startSeconds) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dialogue', index, 'endSeconds'],
        message: 'Dialogue endSeconds must be greater than or equal to startSeconds.',
      })
    }
  }
})

export const sequenceAnimaticShotPlanSchema = z.object({
  sceneId: z.string().default('sequence_animatic_master'),
  totalEditorialDurationSeconds: z.number().positive().max(sequenceAnimaticShotContinuityMaxTotalDurationSeconds),
  shots: z.array(cinematicV2ShotSchema).min(1).max(sequenceAnimaticShotContinuityMaxShotCount),
  performanceArc: z.array(z.object({
    characterRefId: z.string(),
    startState: z.string().default(''),
    endState: z.string().default(''),
    arc: z.string().default(''),
  })).default([]),
  audioPlan: z.object({
    ambience: z.string().default(''),
    music: z.string().default(''),
    sfx: z.array(z.string()).default([]),
    dialogueTrackCount: z.number().int().nonnegative().default(0),
    placeholderOnly: z.boolean().default(true),
  }).default({ ambience: '', music: '', sfx: [], dialogueTrackCount: 0, placeholderOnly: true }),
  diagnostics: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuityBlockV2Schema = z.object({
  id: z.string().min(1),
  index: z.number().int().positive(),
  title: z.string().default(''),
  summary: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuitySceneGraphAdditionsV2Schema = z.object({
  sets: z.array(sequenceAnimaticContinuityGraphSetSchema).default([]),
  zones: z.array(sequenceAnimaticContinuityGraphZoneSchema).default([]),
  spots: z.array(sequenceAnimaticContinuityGraphSpotSchema).default([]),
  viewpoints: z.array(sequenceAnimaticContinuityGraphAngleSchema).default([]),
  angles: z.array(sequenceAnimaticContinuityGraphAngleSchema).default([]),
  edges: z.array(sequenceAnimaticContinuityGraphEdgeSchema).default([]),
})

export const sequenceAnimaticShotContinuityLocalReferenceV2Schema = z.object({
  id: z.string().min(1),
  type: z.enum(['temp_character', 'prop', 'item', 'faction', 'crowd', 'vehicle', 'location_spot']),
  name: z.string().min(1),
  visualBrief: z.string().min(1),
  usedShotIds: z.array(z.string()).default([]),
  blockIds: z.array(z.string()).default([]),
  required: z.boolean().default(false),
  importance: z.enum(['hero', 'supporting', 'incidental']).default('supporting'),
  parentNodeId: z.string().default(''),
  sourceReferenceIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuityPlanV2Schema = z.object({
  role: z.literal('sequence_animatic_director_plan').default('sequence_animatic_director_plan'),
  contractVersion: z.literal('shot_continuity_plan_v2').default('shot_continuity_plan_v2'),
  graphSpecVersion: z.literal('sequence_animatic_graph_v2').default('sequence_animatic_graph_v2'),
  screenplayAnimaticRole: z.literal('director_plan').default('director_plan'),
  sequenceAnimaticRole: z.literal('director_plan').default('director_plan'),
  planningMode: z.literal('single_director_pass').default('single_director_pass'),
  screenplaySummary: z.string().default(''),
  shots: z.array(sequenceAnimaticShotContinuityShotV2Schema).default([]),
  blocks: z.array(sequenceAnimaticShotContinuityBlockV2Schema).default([]),
  sceneGraphAdditions: sequenceAnimaticShotContinuitySceneGraphAdditionsV2Schema.default({
    sets: [],
    zones: [],
    spots: [],
    viewpoints: [],
    angles: [],
    edges: [],
  }),
  coverageSetups: z.array(sequenceAnimaticShotContinuityCoverageSetupV2Schema).default([]),
  localReferences: z.array(sequenceAnimaticShotContinuityLocalReferenceV2Schema).default([]),
  notes: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuityStreamPlanStartRecordSchema = z.object({
  kind: z.literal('plan_start'),
  contractVersion: z.literal('shot_continuity_plan_v2').default('shot_continuity_plan_v2'),
  graphSpecVersion: z.literal('sequence_animatic_graph_v2').default('sequence_animatic_graph_v2'),
  note: z.string().default(''),
})

export const sequenceAnimaticShotContinuityStreamBlockRecordSchema = sequenceAnimaticShotContinuityBlockV2Schema.extend({
  kind: z.literal('block'),
})

export const sequenceAnimaticShotContinuityStreamShotRecordSchema = sequenceAnimaticShotContinuityShotV2Schema.extend({
  kind: z.literal('shot'),
})

export const sequenceAnimaticShotContinuityStreamSceneGraphRecordSchema = z.object({
  kind: z.literal('scene_graph_addition'),
  nodeKind: z.enum(['set', 'zone', 'spot', 'viewpoint', 'angle']),
  id: z.string().min(1),
  name: z.string().min(1),
  visualBrief: z.string().min(1),
  worldLocationRefId: z.string().nullable().default(null),
  setId: z.string().default(''),
  zoneId: z.string().default(''),
  spotIds: z.array(z.string()).default([]),
  landmarks: z.array(z.string()).default([]),
  framing: z.string().default(''),
  cameraPosition: z.string().default(''),
  facingDirection: z.string().default(''),
  subjectPosition: z.string().default(''),
  visibleLandmarks: z.array(z.string()).default([]),
  lightingDirection: z.string().default(''),
  shotIds: z.array(z.string()).default([]),
  storyboardBlockIds: z.array(z.string()).default([]),
  blockIds: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuityStreamSpotRelationRecordSchema = z.object({
  kind: z.literal('spot_relation'),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  relationship: sequenceAnimaticContinuityGraphEdgeSchema.shape.relationship,
  evidence: z.string().default(''),
  direction: z.string().default(''),
  screenDirection: z.string().default(''),
})

export const sequenceAnimaticShotContinuityStreamCoverageSetupRecordSchema = sequenceAnimaticShotContinuityCoverageSetupV2Schema.extend({
  kind: z.literal('coverage_setup'),
})

export const sequenceAnimaticShotContinuityStreamLocalReferenceRecordSchema = sequenceAnimaticShotContinuityLocalReferenceV2Schema.extend({
  kind: z.literal('local_reference'),
})

export const sequenceAnimaticShotContinuityStreamPlanDoneRecordSchema = z.object({
  kind: z.literal('plan_done'),
  shotCount: z.number().int().nonnegative().default(0),
  blockCount: z.number().int().nonnegative().default(0),
  orderedShotIds: z.array(z.string()).default([]),
  orderedBlockIds: z.array(z.string()).default([]),
  screenplaySummary: z.string().default(''),
  notes: z.array(z.string()).default([]),
})

export const sequenceAnimaticShotContinuityStreamRecordSchema = z.discriminatedUnion('kind', [
  sequenceAnimaticShotContinuityStreamPlanStartRecordSchema,
  sequenceAnimaticShotContinuityStreamBlockRecordSchema,
  sequenceAnimaticShotContinuityStreamShotRecordSchema,
  sequenceAnimaticShotContinuityStreamSceneGraphRecordSchema,
  sequenceAnimaticShotContinuityStreamSpotRelationRecordSchema,
  sequenceAnimaticShotContinuityStreamCoverageSetupRecordSchema,
  sequenceAnimaticShotContinuityStreamLocalReferenceRecordSchema,
  sequenceAnimaticShotContinuityStreamPlanDoneRecordSchema,
])

export type SequenceAnimaticShotContinuityStreamRecord = z.infer<typeof sequenceAnimaticShotContinuityStreamRecordSchema>
