import type { OutputWorkflowNode, OutputWorkflowRunScope } from './outputWorkflow.ts'

export type OutputWorkflowNodeContract = {
  purpose: string
  label: string
  requiredInputs: string[]
  producedOutputs: string[]
  artifactRoles: string[]
  previewRoles: string[]
  recoveryStrategy: 'node_step_artifact' | 'node_step' | 'none'
  progressLabel: string
  providerBacked: boolean
  manualOnly: boolean
}

const cinematicSequenceContracts = [
  {
    purpose: 'cinematic_v3_storyboard_prompt',
    label: 'Storyboard Prompt',
    requiredInputs: ['shot_plan', 'asset_pack'],
    producedOutputs: ['text', 'prompt', 'providerPrompt'],
    artifactRoles: [],
    previewRoles: ['text'],
    recoveryStrategy: 'node_step',
    progressLabel: 'Preparing storyboard prompt',
    providerBacked: false,
    manualOnly: false,
  },
  {
    purpose: 'cinematic_v3_storyboard_sheet',
    label: 'Storyboard Sheet',
    requiredInputs: ['prompt'],
    producedOutputs: ['image', 'assetKey'],
    artifactRoles: ['cinematic_v3_storyboard_sheet', 'cinematic_v2_storyboard_sheet'],
    previewRoles: ['image'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Generating storyboard sheet',
    providerBacked: true,
    manualOnly: false,
  },
  {
    purpose: 'cinematic_v3_panel_extract',
    label: 'Extract Panels',
    requiredInputs: ['image', 'shot_plan'],
    producedOutputs: ['panels', 'artifacts'],
    artifactRoles: ['cinematic_v3_storyboard_panel', 'cinematic_v2_storyboard_panel', 'sequence_animatic_block_panel'],
    previewRoles: ['panels'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Extracting storyboard panels',
    providerBacked: false,
    manualOnly: false,
  },
  {
    purpose: 'cinematic_v3_storyboard_group_video_prompt',
    label: 'Video Prompt',
    requiredInputs: ['shot_plan', 'asset_pack'],
    producedOutputs: ['text', 'prompt', 'providerPrompt'],
    artifactRoles: ['sequence_animatic_block_manifest'],
    previewRoles: ['text'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Preparing video prompt',
    providerBacked: false,
    manualOnly: false,
  },
  {
    purpose: 'cinematic_v3_storyboard_group_video',
    label: 'Video',
    requiredInputs: ['prompt', 'references'],
    producedOutputs: ['video', 'assetKey'],
    artifactRoles: ['cinematic_v3_storyboard_group_video', 'sequence_animatic_block_video'],
    previewRoles: ['video'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Generating video',
    providerBacked: true,
    manualOnly: true,
  },
  {
    purpose: 'sequence_animatic_shot_video_prompt',
    label: 'Shot Video Prompt',
    requiredInputs: ['shot', 'asset_pack', 'references'],
    producedOutputs: ['text', 'prompt', 'providerPrompt'],
    artifactRoles: [],
    previewRoles: ['text'],
    recoveryStrategy: 'node_step',
    progressLabel: 'Preparing shot video prompt',
    providerBacked: false,
    manualOnly: false,
  },
  {
    purpose: 'sequence_animatic_shot_video',
    label: 'Shot Video',
    requiredInputs: ['prompt', 'references'],
    producedOutputs: ['video', 'assetKey'],
    artifactRoles: ['sequence_animatic_shot_video'],
    previewRoles: ['video'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Generating shot video',
    providerBacked: true,
    manualOnly: true,
  },
  {
    purpose: 'sequence_animatic_continuity_anchor_plan',
    label: 'Plan Continuity Anchors',
    requiredInputs: ['screenplay', 'shot_plan'],
    producedOutputs: ['text', 'continuityAnchorPlan'],
    artifactRoles: [],
    previewRoles: ['text'],
    recoveryStrategy: 'node_step',
    progressLabel: 'Finding reusable characters, props, and locations',
    providerBacked: false,
    manualOnly: false,
  },
  {
    purpose: 'sequence_animatic_character_anchor_atlas',
    label: 'Character Anchor Atlas',
    requiredInputs: ['prompt'],
    producedOutputs: ['image', 'assetKey'],
    artifactRoles: ['sequence_animatic_character_anchor_atlas'],
    previewRoles: ['image'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Generating temporary character atlas',
    providerBacked: true,
    manualOnly: false,
  },
  {
    purpose: 'sequence_animatic_character_anchor_extract',
    label: 'Extract Character Anchors',
    requiredInputs: ['image', 'continuity_anchor_plan'],
    producedOutputs: ['anchors', 'artifacts'],
    artifactRoles: ['sequence_animatic_character_anchor'],
    previewRoles: ['anchors'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Splitting character refs',
    providerBacked: false,
    manualOnly: false,
  },
  {
    purpose: 'sequence_animatic_prop_anchor_atlas',
    label: 'Prop Anchor Atlas',
    requiredInputs: ['prompt'],
    producedOutputs: ['image', 'assetKey'],
    artifactRoles: ['sequence_animatic_prop_anchor_atlas'],
    previewRoles: ['image'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Generating prop reference atlas',
    providerBacked: true,
    manualOnly: false,
  },
  {
    purpose: 'sequence_animatic_prop_anchor_extract',
    label: 'Extract Prop Anchors',
    requiredInputs: ['image', 'continuity_anchor_plan'],
    producedOutputs: ['anchors', 'artifacts'],
    artifactRoles: ['sequence_animatic_prop_anchor'],
    previewRoles: ['anchors'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Splitting prop refs',
    providerBacked: false,
    manualOnly: false,
  },
  {
    purpose: 'sequence_animatic_location_anchor_atlas',
    label: 'Location Anchor Atlas',
    requiredInputs: ['prompt'],
    producedOutputs: ['image', 'assetKey'],
    artifactRoles: ['sequence_animatic_location_anchor_atlas'],
    previewRoles: ['image'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Generating location spot atlas',
    providerBacked: true,
    manualOnly: false,
  },
  {
    purpose: 'sequence_animatic_location_anchor_extract',
    label: 'Extract Location Anchors',
    requiredInputs: ['image', 'continuity_anchor_plan'],
    producedOutputs: ['anchors', 'artifacts'],
    artifactRoles: ['sequence_animatic_location_anchor'],
    previewRoles: ['anchors'],
    recoveryStrategy: 'node_step_artifact',
    progressLabel: 'Splitting location refs',
    providerBacked: false,
    manualOnly: false,
  },
] satisfies OutputWorkflowNodeContract[]

export const outputWorkflowNodeContractsByPurpose = new Map<string, OutputWorkflowNodeContract>(
  cinematicSequenceContracts.map((contract) => [contract.purpose, contract]),
)

export function outputWorkflowNodePurpose(nodeOrConfig: Pick<OutputWorkflowNode, 'config'> | Record<string, unknown> | null | undefined) {
  const config = nodeOrConfig && 'config' in nodeOrConfig
    ? nodeOrConfig.config
    : nodeOrConfig
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ''
  const record = config as Record<string, unknown>
  return typeof record.purpose === 'string' && record.purpose.trim()
    ? record.purpose.trim()
    : typeof record.role === 'string'
      ? record.role.trim()
      : ''
}

export function getOutputWorkflowNodeContract(nodeOrConfig: Pick<OutputWorkflowNode, 'config'> | Record<string, unknown> | null | undefined) {
  const purpose = outputWorkflowNodePurpose(nodeOrConfig)
  return purpose ? outputWorkflowNodeContractsByPurpose.get(purpose) ?? null : null
}

export type OutputWorkflowRunIntent =
  | 'prepare_storyboard_block'
  | 'generate_block_video'
  | 'generate_shot_video'
  | 'repair_upstream_cache'
  | 'rerun_node_and_dependents'

export type OutputWorkflowRunIntentDefaults = {
  runScope: OutputWorkflowRunScope
  debugSkipVideoGeneration?: boolean
  cinematicVideoApproved?: boolean
  allowStaleUpstreamOutputs?: boolean
}

export function outputWorkflowRunIntentDefaults(intent: string | null | undefined): OutputWorkflowRunIntentDefaults | null {
  switch (intent) {
    case 'prepare_storyboard_block':
      return {
        runScope: 'upstream_to_node',
        debugSkipVideoGeneration: true,
        cinematicVideoApproved: false,
        allowStaleUpstreamOutputs: false,
      }
    case 'generate_block_video':
      return {
        runScope: 'node_only',
        debugSkipVideoGeneration: false,
        cinematicVideoApproved: true,
        allowStaleUpstreamOutputs: true,
      }
    case 'generate_shot_video':
      return {
        runScope: 'upstream_to_node',
        debugSkipVideoGeneration: false,
        cinematicVideoApproved: true,
        allowStaleUpstreamOutputs: true,
      }
    case 'repair_upstream_cache':
      return {
        runScope: 'upstream_to_node',
        allowStaleUpstreamOutputs: true,
      }
    case 'rerun_node_and_dependents':
      return {
        runScope: 'node_and_downstream',
        allowStaleUpstreamOutputs: false,
      }
    default:
      return null
  }
}
