import { z } from 'zod'

import {
  createWorkflowTemplateRegistry,
  workflowTemplateSourceHash,
  type WorkflowTemplateRegistryEntry,
} from '../../../src/domain/outputWorkflowTemplateRegistry.ts'
import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticWorkflowEdge,
  sequenceAnimaticWorkflowNode,
} from './sequence-animatic-workflow-factory.ts'

export const sequenceAnimaticSceneBoardPrepPolicyVersion = 'scene_board_prep_graph_v1'
export const sequenceAnimaticSceneBoardPrepTemplateKey = 'sequence_animatic_scene_board_prep'

export const sequenceAnimaticSceneBoardPrepTemplateInputSchema = z.object({
  workflowId: z.string().min(1),
  draftId: z.string().min(1),
  commonConfig: z.record(z.string(), z.unknown()).default({}),
  command: z.record(z.string(), z.unknown()).default({}),
}).strict()

export function buildSequenceAnimaticSceneBoardPrepWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  command: Record<string, unknown>
}) {
  const role = 'scene_board_prep'
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    sceneBoardPrepPolicyVersion: sequenceAnimaticSceneBoardPrepPolicyVersion,
    ...input.commonConfig,
    command: input.command,
    sceneBoardCommand: input.command,
    scene_board_command: input.command,
    screenplayAnimaticRole: role,
    sequenceAnimaticRole: role,
  }
  const utilityStageConfig = (stage: string, label: string, extra: Record<string, unknown> = {}) => ({
    ...config,
    stage,
    stageLabel: label,
    optionalChildWorkflow: true,
    optionalChildWorkflows: true,
    optional_child_workflows: true,
    childTemplateKey: `scene_board_${stage}`,
    identityKey: 'sceneBoardPrepIdentity',
    identityValue: `${String(input.commonConfig.sceneBoardPrepIdentity ?? 'scene_board_prep')}:${stage}`,
    execution: { resourceClass: 'utility' as const, groupKey: `scene_board_${stage}`, maxConcurrency: 4 },
    ...extra,
  })
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'scope_input', 'utility_transform', 'Scene Board Scope', 80, 120, {
      purpose: 'sequence_animatic_scene_board_scope_input',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_board_scope_input', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'required_ref_plan', 'utility_transform', 'Plan Required Refs', 360, 120, {
      purpose: 'sequence_animatic_scene_board_required_ref_plan',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_board_required_ref_plan', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'fanout_set_refs', 'utility_transform', 'Fan Out Set Refs', 640, 60, {
      purpose: 'workflow_fanout_children',
      ...utilityStageConfig('set_refs', 'Ensure set references', {
        role: 'continuity_asset',
        requiredArtifactRoles: ['sequence_animatic_continuity_asset'],
      }),
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'collect_set_refs', 'utility_transform', 'Collect Set Refs', 640, 180, {
      purpose: 'workflow_collect_child_artifacts',
      ...utilityStageConfig('set_refs', 'Collect set references', {
        requiredArtifactRoles: ['sequence_animatic_continuity_asset'],
        resumeAfterMs: 15_000,
      }),
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'fanout_scaffold_refs', 'utility_transform', 'Fan Out Zone Map / Spot Atlas', 920, 60, {
      purpose: 'workflow_fanout_children',
      ...utilityStageConfig('scaffold_refs', 'Ensure zone map and spot atlas', {
        role: 'continuity_asset',
        requiredArtifactRoles: ['sequence_animatic_continuity_asset'],
      }),
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'collect_scaffold_refs', 'utility_transform', 'Collect Zone Map / Spot Atlas', 920, 180, {
      purpose: 'workflow_collect_child_artifacts',
      ...utilityStageConfig('scaffold_refs', 'Collect zone map and spot atlas', {
        requiredArtifactRoles: ['sequence_animatic_continuity_asset'],
        resumeAfterMs: 15_000,
      }),
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_intent_batch', 'utility_transform', 'Plan Coverage Direction Children', 1200, 120, {
      purpose: 'sequence_animatic_scene_board_coverage_intent_batch',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_board_coverage_intent_batch', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'fanout_coverage_intents', 'utility_transform', 'Fan Out Coverage Directions', 1280, 60, {
      purpose: 'workflow_fanout_children',
      ...utilityStageConfig('coverage_directions', 'Ensure coverage directions', {
        role: 'coverage_intent_batch',
        requiredArtifactRoles: ['sequence_animatic_coverage_intent_batch'],
      }),
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'collect_coverage_intents', 'utility_transform', 'Collect Coverage Directions', 1280, 180, {
      purpose: 'workflow_collect_child_artifacts',
      ...utilityStageConfig('coverage_directions', 'Collect coverage directions', {
        requiredArtifactRoles: ['sequence_animatic_coverage_intent_batch'],
        resumeAfterMs: 15_000,
      }),
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'zone_coverage_grid', 'utility_transform', 'Plan Zone Coverage Grid Children', 1480, 120, {
      purpose: 'sequence_animatic_scene_board_zone_coverage_grid',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_board_zone_coverage_grid', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'fanout_zone_coverage_grids', 'utility_transform', 'Fan Out Zone Coverage Grids', 1560, 60, {
      purpose: 'workflow_fanout_children',
      ...utilityStageConfig('coverage_grids', 'Ensure zone coverage grids', {
        role: 'zone_coverage_board',
        requiredArtifactRoles: ['sequence_animatic_zone_coverage_board'],
      }),
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'collect_zone_coverage_grids', 'utility_transform', 'Collect Zone Coverage Grids', 1560, 180, {
      purpose: 'workflow_collect_child_artifacts',
      ...utilityStageConfig('coverage_grids', 'Collect zone coverage grids', {
        requiredArtifactRoles: ['sequence_animatic_zone_coverage_board'],
        resumeAfterMs: 15_000,
      }),
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'register_projection', 'utility_transform', 'Register Prep Projection', 1760, 120, {
      purpose: 'workflow_register_artifact_projection',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_board_register_projection', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_cell_artifact', 'output_artifact', 'Register Board Prep', 2040, 120, {
      purpose: 'sequence_animatic_scene_board_coverage_cell_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_scene_board_coverage_cell_artifact', maxConcurrency: 4 },
    }, {}, role),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'scope__required_refs', 'scope_input', 'scope', 'required_ref_plan', 'scope', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'required_refs__fanout_set_refs', 'required_ref_plan', 'requiredRefs', 'fanout_set_refs', 'requiredRefs', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'fanout_set_refs__collect_set_refs', 'fanout_set_refs', 'children', 'collect_set_refs', 'children', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'collect_set_refs__fanout_scaffold_refs', 'collect_set_refs', 'workflowRuntime', 'fanout_scaffold_refs', 'upstreamStatus', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'fanout_scaffold_refs__collect_scaffold_refs', 'fanout_scaffold_refs', 'children', 'collect_scaffold_refs', 'children', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'collect_scaffold_refs__coverage_intent_batch', 'collect_scaffold_refs', 'workflowRuntime', 'coverage_intent_batch', 'scaffoldRefStatus', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'coverage_intent_batch__fanout_coverage_intents', 'coverage_intent_batch', 'childWorkflows', 'fanout_coverage_intents', 'childWorkflows', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'fanout_coverage_intents__collect_coverage_intents', 'fanout_coverage_intents', 'children', 'collect_coverage_intents', 'children', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'collect_coverage_intents__zone_coverage_grid', 'collect_coverage_intents', 'workflowRuntime', 'zone_coverage_grid', 'coverageIntentStatus', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'zone_coverage_grid__fanout_zone_coverage_grids', 'zone_coverage_grid', 'childWorkflows', 'fanout_zone_coverage_grids', 'childWorkflows', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'fanout_zone_coverage_grids__collect_zone_coverage_grids', 'fanout_zone_coverage_grids', 'children', 'collect_zone_coverage_grids', 'children', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'fanout_set_refs__projection', 'fanout_set_refs', 'children', 'register_projection', 'setRefChildren', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'collect_set_refs__projection', 'collect_set_refs', 'workflowRuntime', 'register_projection', 'setRefs', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'fanout_scaffold_refs__projection', 'fanout_scaffold_refs', 'children', 'register_projection', 'scaffoldRefChildren', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'collect_scaffold_refs__projection', 'collect_scaffold_refs', 'workflowRuntime', 'register_projection', 'scaffoldRefs', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'coverage_intent_batch__projection', 'coverage_intent_batch', 'coverageIntentStatus', 'register_projection', 'coverageIntentStatus', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'fanout_coverage_intents__projection', 'fanout_coverage_intents', 'children', 'register_projection', 'coverageIntentChildren', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'collect_coverage_intents__projection', 'collect_coverage_intents', 'workflowRuntime', 'register_projection', 'coverageIntents', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'zone_coverage_grid__projection', 'zone_coverage_grid', 'zoneCoverageStatus', 'register_projection', 'zoneCoverageStatus', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'fanout_zone_coverage_grids__projection', 'fanout_zone_coverage_grids', 'children', 'register_projection', 'zoneCoverageGridChildren', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'collect_zone_coverage_grids__projection', 'collect_zone_coverage_grids', 'workflowRuntime', 'register_projection', 'zoneCoverageGrids', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'projection__artifact', 'register_projection', 'workflowRuntime', 'coverage_cell_artifact', 'workflowRuntime', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'scope__artifact', 'scope_input', 'scope', 'coverage_cell_artifact', 'scope', {}, role),
  ]
  return { nodes, edges }
}

export const sequenceAnimaticSceneBoardPrepTemplateManifest: WorkflowTemplateRegistryEntry<
  z.infer<typeof sequenceAnimaticSceneBoardPrepTemplateInputSchema>,
  ReturnType<typeof buildSequenceAnimaticSceneBoardPrepWorkflowGraph>
> = {
  key: sequenceAnimaticSceneBoardPrepTemplateKey,
  label: 'Scene Board Prep',
  description: 'Server-owned graph template for Scene Board preparation commands.',
  inputSchema: sequenceAnimaticSceneBoardPrepTemplateInputSchema,
  policyVersion: sequenceAnimaticSceneBoardPrepPolicyVersion,
  buildGraph: buildSequenceAnimaticSceneBoardPrepWorkflowGraph,
  sourceHash: (input) => workflowTemplateSourceHash({
    policyVersion: sequenceAnimaticSceneBoardPrepPolicyVersion,
    draftId: input.draftId,
    commonConfig: input.commonConfig,
    command: input.command,
  }),
}

export const sequenceAnimaticWorkflowTemplateRegistry = createWorkflowTemplateRegistry([
  sequenceAnimaticSceneBoardPrepTemplateManifest,
])

export function buildSequenceAnimaticZoneCoverageBoardWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  board: Record<string, unknown>
  shots: Record<string, unknown>[]
  coverageCells: Record<string, unknown>[]
  assetPack: Record<string, unknown>
  referenceAssetKeys: string[]
  previousBoard?: Record<string, unknown>
}) {
  const role = 'zone_coverage_board'
  const gridLayout = { rows: 3, columns: 3, cellCount: Math.min(9, Math.max(1, input.coverageCells.length || input.shots.length || 1)) }
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
    board: input.board,
    zoneCoverageBoard: input.board,
    zone_coverage_board: input.board,
    shots: input.shots,
    coverageCells: input.coverageCells,
    coverage_cells: input.coverageCells,
    assetPack: input.assetPack,
    asset_pack: input.assetPack,
    referenceAssetKeys: input.referenceAssetKeys,
    reference_asset_keys: input.referenceAssetKeys,
    previousBoard: input.previousBoard ?? {},
    previous_board: input.previousBoard ?? {},
    gridLayout,
    grid_layout: gridLayout,
    screenplayAnimaticRole: role,
    sequenceAnimaticRole: role,
  }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'zone_coverage_board_input', 'utility_transform', 'Zone Camera Grid Input', 80, 120, {
      purpose: 'sequence_animatic_zone_coverage_board_input',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_zone_coverage_board_input', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'zone_coverage_board_brief', 'utility_transform', 'Zone Camera Grid Brief', 360, 120, {
      purpose: 'sequence_animatic_zone_coverage_board_brief',
      ...config,
      execution: { resourceClass: 'llm', groupKey: 'sequence_animatic_zone_coverage_board_brief', maxConcurrency: 2 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'zone_coverage_board_prompt', 'utility_transform', 'Zone Camera Grid Prompt', 640, 120, {
      purpose: 'sequence_animatic_zone_coverage_board_prompt',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_zone_coverage_board_prompt', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'zone_coverage_board_image', 'image_generation', 'Zone Camera Grid Image', 920, 120, {
      purpose: 'sequence_animatic_zone_coverage_board_image',
      role: 'sequence_animatic_zone_coverage_board_image',
      ...config,
      model: 'openai/gpt-image-2',
      referenceModel: 'openai/gpt-image-2/edit',
      quality: 'medium',
      outputFormat: 'webp',
      maxReferenceImages: 12,
      imageSize: { width: 3072, height: 1728 },
      planningOnly: true,
      planning_only: true,
      execution: { resourceClass: 'image', groupKey: 'sequence_animatic_zone_coverage_board_image', maxConcurrency: 1 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'zone_coverage_board_extract', 'utility_transform', 'Extract Zone Camera Cells', 1200, 120, {
      purpose: 'sequence_animatic_zone_coverage_board_extract',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_zone_coverage_board_extract', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'zone_coverage_board_artifact', 'output_artifact', 'Register Zone Camera Grid', 1480, 120, {
      purpose: 'sequence_animatic_zone_coverage_board_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_zone_coverage_board_artifact', maxConcurrency: 4 },
    }, {}, role),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__brief_board', 'zone_coverage_board_input', 'board', 'zone_coverage_board_brief', 'board', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__brief_shots', 'zone_coverage_board_input', 'shots', 'zone_coverage_board_brief', 'shots', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__brief_cells', 'zone_coverage_board_input', 'coverage_cells', 'zone_coverage_board_brief', 'coverage_cells', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__brief_refs', 'zone_coverage_board_input', 'asset_pack', 'zone_coverage_board_brief', 'asset_pack', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__brief_previous', 'zone_coverage_board_input', 'previous_board', 'zone_coverage_board_brief', 'previous_board', { optional: true, optionalDependency: true }, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_board', 'zone_coverage_board_input', 'board', 'zone_coverage_board_prompt', 'board', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_cells', 'zone_coverage_board_input', 'coverage_cells', 'zone_coverage_board_prompt', 'coverage_cells', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_refs', 'zone_coverage_board_input', 'asset_pack', 'zone_coverage_board_prompt', 'asset_pack', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__prompt_previous', 'zone_coverage_board_input', 'previous_board', 'zone_coverage_board_prompt', 'previous_board', { optional: true, optionalDependency: true }, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'brief__prompt_cells', 'zone_coverage_board_brief', 'coverage_brief', 'zone_coverage_board_prompt', 'coverage_brief', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image', 'zone_coverage_board_prompt', 'text', 'zone_coverage_board_image', 'prompt', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__image_refs', 'zone_coverage_board_prompt', 'asset_pack', 'zone_coverage_board_image', 'asset_pack', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__extract_board', 'zone_coverage_board_input', 'board', 'zone_coverage_board_extract', 'board', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__extract_cells', 'zone_coverage_board_input', 'coverage_cells', 'zone_coverage_board_extract', 'coverage_cells', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'image__extract', 'zone_coverage_board_image', 'image', 'zone_coverage_board_extract', 'image', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__artifact_board', 'zone_coverage_board_input', 'board', 'zone_coverage_board_artifact', 'board', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'prompt__artifact_prompt', 'zone_coverage_board_prompt', 'text', 'zone_coverage_board_artifact', 'prompt', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'image__artifact_image', 'zone_coverage_board_image', 'image', 'zone_coverage_board_artifact', 'image', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'extract__artifact_cells', 'zone_coverage_board_extract', 'cells', 'zone_coverage_board_artifact', 'cells', {}, role),
  ]
  return { nodes, edges }
}

export function buildSequenceAnimaticShotCoverageIntentWorkflowGraph(input: {
  workflowId: string
  draftId: string
  commonConfig: Record<string, unknown>
  intentBatch: Record<string, unknown>
  shots: Record<string, unknown>[]
  assetPack: Record<string, unknown>
}) {
  const role = 'coverage_intent_batch'
  const config = {
    graphSpecVersion: sequenceAnimaticGraphSpecVersion,
    ...input.commonConfig,
    intentBatch: input.intentBatch,
    intent_batch: input.intentBatch,
    shots: input.shots,
    assetPack: input.assetPack,
    asset_pack: input.assetPack,
    screenplayAnimaticRole: role,
    sequenceAnimaticRole: role,
  }
  const nodes = [
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_intent_input', 'utility_transform', 'Coverage Direction Input', 80, 120, {
      purpose: 'sequence_animatic_coverage_intent_input',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_coverage_intent_input', maxConcurrency: 4 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_intent_plan', 'utility_transform', 'Coverage Directions', 360, 120, {
      purpose: 'sequence_animatic_coverage_intent_plan',
      ...config,
      execution: { resourceClass: 'llm', groupKey: 'sequence_animatic_coverage_intent_plan', maxConcurrency: 2 },
    }, {}, role),
    sequenceAnimaticWorkflowNode(input.workflowId, input.draftId, 'coverage_intent_artifact', 'output_artifact', 'Register Coverage Directions', 640, 120, {
      purpose: 'sequence_animatic_coverage_intent_artifact',
      artifactKind: 'other',
      ...config,
      execution: { resourceClass: 'utility', groupKey: 'sequence_animatic_coverage_intent_artifact', maxConcurrency: 4 },
    }, {}, role),
  ]
  const edges = [
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_batch', 'coverage_intent_input', 'intent_batch', 'coverage_intent_plan', 'intent_batch', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_shots', 'coverage_intent_input', 'shots', 'coverage_intent_plan', 'shots', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__plan_refs', 'coverage_intent_input', 'asset_pack', 'coverage_intent_plan', 'asset_pack', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'input__artifact_batch', 'coverage_intent_input', 'intent_batch', 'coverage_intent_artifact', 'intent_batch', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__artifact_intents', 'coverage_intent_plan', 'coverage_intents', 'coverage_intent_artifact', 'coverage_intents', {}, role),
    sequenceAnimaticWorkflowEdge(input.workflowId, input.draftId, 'plan__artifact_prompt', 'coverage_intent_plan', 'prompt', 'coverage_intent_artifact', 'prompt', {}, role),
  ]
  return { nodes, edges }
}
