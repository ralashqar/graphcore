/**
 * Canonical node keys for sequence-animatic workflow graphs.
 *
 * These keys are shared between the server-side workflow factory
 * (supabase/functions/_shared/sequence-animatic-workflow-factory.ts) and the
 * client run orchestration (targetNodeKeys / forceNodeKeys in run metadata).
 * A silent mismatch between the two breaks runs without an error, so both
 * sides must import from this module instead of using string literals.
 */

export const SEQUENCE_ANIMATIC_NODE_KEYS = {
  // Single continuity asset workflow
  continuityAssetInput: 'continuity_asset_input',
  continuityAssetPrompt: 'continuity_asset_prompt',
  continuityAssetImage: 'continuity_asset_image',
  continuityAssetArtifact: 'continuity_asset_artifact',
  // Batched continuity asset (grid) workflow
  continuityBatchInput: 'continuity_batch_input',
  continuityBatchPrompt: 'continuity_batch_prompt',
  continuityBatchImage: 'continuity_batch_image',
  continuityBatchExtract: 'continuity_batch_extract',
  continuityBatchArtifact: 'continuity_batch_artifact',
  // Scene-level zone coverage board workflow
  zoneCoverageBoardInput: 'zone_coverage_board_input',
  zoneCoverageBoardBrief: 'zone_coverage_board_brief',
  zoneCoverageBoardPrompt: 'zone_coverage_board_prompt',
  zoneCoverageBoardImage: 'zone_coverage_board_image',
  zoneCoverageBoardExtract: 'zone_coverage_board_extract',
  zoneCoverageBoardArtifact: 'zone_coverage_board_artifact',
  // Coverage anchor workflow
  coverageAnchorBrief: 'coverage_anchor_brief',
  coverageAnchorPrompt: 'coverage_anchor_prompt',
  coverageAnchorImage: 'coverage_anchor_image',
  coverageAnchorArtifact: 'coverage_anchor_artifact',
  // Planned shot keyframe workflow
  plannedKeyframePrompt: 'planned_keyframe_prompt',
  plannedKeyframeImage: 'planned_keyframe_image',
  plannedKeyframeArtifact: 'planned_keyframe_artifact',
  // Graph-native shot production workflow
  shotReferencePack: 'shot_reference_pack',
  shotVideoArtifact: 'shot_video_artifact',
  // Shot video workflow
  shotVideoPrompt: 'shot_video_prompt',
  shotVideo: 'shot_video',
  // Storyboard block workflow terminal artifact node
  blockArtifact: 'artifact',
  // Per-scene shot plan child workflow (the stream node key is per-scene so
  // master-request event clearing stays scoped to one scene; see
  // sequenceAnimaticSceneShotPlanNodeKey below)
  sceneInput: 'scene_input',
  scenePlanArtifact: 'scene_plan_artifact',
  sceneCombinedPlanRefresh: 'scene_combined_plan_refresh',
} as const

export type SequenceAnimaticNodeKey = (typeof SEQUENCE_ANIMATIC_NODE_KEYS)[keyof typeof SEQUENCE_ANIMATIC_NODE_KEYS]

/** Force-node list to (re)generate a single continuity asset end to end. */
export const sequenceAnimaticContinuityAssetForceNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityAssetPrompt,
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityAssetImage,
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityAssetArtifact,
] as const

/** Force-node list to (re)generate a continuity asset batch grid end to end. */
export const sequenceAnimaticContinuityBatchForceNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityBatchPrompt,
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityBatchImage,
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityBatchExtract,
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityBatchArtifact,
] as const

export const sequenceAnimaticContinuityAssetTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityAssetArtifact,
] as const

export const sequenceAnimaticContinuityBatchTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.continuityBatchArtifact,
] as const

/** Force/target node lists for scene-level zone coverage boards. */
export const sequenceAnimaticZoneCoverageBoardTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.zoneCoverageBoardArtifact,
] as const

export const sequenceAnimaticZoneCoverageBoardForceNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.zoneCoverageBoardBrief,
  SEQUENCE_ANIMATIC_NODE_KEYS.zoneCoverageBoardPrompt,
  SEQUENCE_ANIMATIC_NODE_KEYS.zoneCoverageBoardImage,
  SEQUENCE_ANIMATIC_NODE_KEYS.zoneCoverageBoardExtract,
  SEQUENCE_ANIMATIC_NODE_KEYS.zoneCoverageBoardArtifact,
] as const

/** Force/target node lists for coverage anchors, keyframes, and shot video runs. */
export const sequenceAnimaticCoverageAnchorTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.coverageAnchorArtifact,
] as const

export const sequenceAnimaticCoverageAnchorForceNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.coverageAnchorBrief,
  SEQUENCE_ANIMATIC_NODE_KEYS.coverageAnchorPrompt,
  SEQUENCE_ANIMATIC_NODE_KEYS.coverageAnchorImage,
  SEQUENCE_ANIMATIC_NODE_KEYS.coverageAnchorArtifact,
] as const

export const sequenceAnimaticPlannedKeyframeTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.plannedKeyframeArtifact,
] as const

export const sequenceAnimaticPlannedKeyframeForceNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.plannedKeyframePrompt,
  SEQUENCE_ANIMATIC_NODE_KEYS.plannedKeyframeImage,
  SEQUENCE_ANIMATIC_NODE_KEYS.plannedKeyframeArtifact,
] as const

export const sequenceAnimaticShotVideoTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.shotVideo,
] as const

export const sequenceAnimaticShotVideoForceNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.shotVideoPrompt,
  SEQUENCE_ANIMATIC_NODE_KEYS.shotVideo,
] as const

export const sequenceAnimaticShotProductionKeyframeTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.plannedKeyframeArtifact,
] as const

export const sequenceAnimaticShotProductionKeyframeForceNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.shotReferencePack,
  SEQUENCE_ANIMATIC_NODE_KEYS.plannedKeyframePrompt,
  SEQUENCE_ANIMATIC_NODE_KEYS.plannedKeyframeImage,
  SEQUENCE_ANIMATIC_NODE_KEYS.plannedKeyframeArtifact,
] as const

export const sequenceAnimaticShotProductionVideoTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.shotVideoArtifact,
] as const

export const sequenceAnimaticShotProductionVideoForceNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.shotVideoPrompt,
  SEQUENCE_ANIMATIC_NODE_KEYS.shotVideo,
  SEQUENCE_ANIMATIC_NODE_KEYS.shotVideoArtifact,
] as const

/**
 * The scene child workflow's stream node key embeds the scene id so that
 * shot-continuity stream events emitted to the master request stay scoped to
 * one scene (event clearing and UI consumers match on this node key, exactly
 * as the old in-master fanout node keys did).
 */
export function sequenceAnimaticSceneShotPlanNodeKey(sceneId: string) {
  return `sequence_animatic_scene_shot_plan_${sceneId}`
}

/** Target node list to run a scene shot-plan child workflow end to end. */
export const sequenceAnimaticSceneTargetNodeKeys = [
  SEQUENCE_ANIMATIC_NODE_KEYS.sceneCombinedPlanRefresh,
] as const

/** Force-node list to regenerate a scene's shot plan end to end. */
export function sequenceAnimaticSceneForceNodeKeys(sceneId: string) {
  return [
    sequenceAnimaticSceneShotPlanNodeKey(sceneId),
    SEQUENCE_ANIMATIC_NODE_KEYS.scenePlanArtifact,
    SEQUENCE_ANIMATIC_NODE_KEYS.sceneCombinedPlanRefresh,
  ] as const
}
