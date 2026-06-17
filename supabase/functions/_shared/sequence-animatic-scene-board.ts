export const sequenceAnimaticSceneBoardWorkflowPurposes = new Set([
  'sequence_animatic_scene_board_scope_input',
  'sequence_animatic_scene_board_required_ref_plan',
  'sequence_animatic_scene_board_set_ref_generation',
  'sequence_animatic_scene_board_scaffold_ref_generation',
  'sequence_animatic_scene_board_coverage_intent_batch',
  'sequence_animatic_scene_board_zone_coverage_grid',
  'sequence_animatic_scene_board_coverage_cell_artifact',
  'sequence_animatic_zone_coverage_board_input',
  'sequence_animatic_zone_coverage_board_brief',
  'sequence_animatic_zone_coverage_board_prompt',
  'sequence_animatic_zone_coverage_board_extract',
  'sequence_animatic_zone_coverage_board_artifact',
  'sequence_animatic_coverage_intent_input',
  'sequence_animatic_coverage_intent_plan',
  'sequence_animatic_coverage_intent_artifact',
])

export function isSequenceAnimaticSceneBoardWorkflowPurpose(purpose: string) {
  return sequenceAnimaticSceneBoardWorkflowPurposes.has(purpose)
}
