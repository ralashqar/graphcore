export const sequenceAnimaticSceneBoardWorkflowPurposes = new Set([
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
