import {
  sequenceAnimaticGraphSpecVersion,
  sequenceAnimaticWorkflowEdge,
  sequenceAnimaticWorkflowNode,
} from './sequence-animatic-workflow-factory.ts'

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
