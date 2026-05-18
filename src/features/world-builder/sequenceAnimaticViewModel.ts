import { getOutputWorkflowNodeContract } from '../../domain/outputWorkflowNodeContracts'

export type SequenceAnimaticProgressRow = {
  statusLabel: string
  progress: { label: string }
  currentStepLabel: string
}

const continuityProgressLabels = [
  { pattern: /sequence_animatic_continuity_anchor_plan|Plan Continuity Anchors/i, label: 'Finding reusable characters, props, and locations' },
  { pattern: /sequence_animatic_character_anchor_atlas\b|Character Anchor Atlas/i, label: 'Generating temporary character atlas' },
  { pattern: /sequence_animatic_character_anchor_extract|Extract Character Anchors/i, label: 'Splitting character refs' },
  { pattern: /sequence_animatic_prop_anchor_atlas\b|Prop Anchor Atlas/i, label: 'Generating prop reference atlas' },
  { pattern: /sequence_animatic_prop_anchor_extract|Extract Prop Anchors/i, label: 'Splitting prop refs' },
  { pattern: /sequence_animatic_location_anchor_atlas\b|Location Anchor Atlas/i, label: 'Generating location spot atlas' },
  { pattern: /sequence_animatic_location_anchor_extract|Extract Location Anchors/i, label: 'Splitting location refs' },
]

export function sequenceAnimaticFriendlyProgressLabel(rawLabel: string, nodeKey = '') {
  const contract = getOutputWorkflowNodeContract({ purpose: nodeKey })
  if (contract?.progressLabel) return contract.progressLabel
  const combined = `${nodeKey} ${rawLabel}`
  return continuityProgressLabels.find((entry) => entry.pattern.test(combined))?.label || rawLabel
}
