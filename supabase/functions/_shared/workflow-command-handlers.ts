import { runSceneBoardWorkflowCommand } from './scene-board-workflow-command.ts'
import { runSequenceAnimaticBlockWorkflowCommand } from './sequence-animatic-block-workflow-command.ts'
import { runSequenceAnimaticContinuityAssetWorkflowCommand } from './sequence-animatic-continuity-asset-workflow-command.ts'
import { runSequenceAnimaticContinuityWorkflowCommand } from './sequence-animatic-continuity-workflow-command.ts'
import { runSequenceAnimaticKeyframeWorkflowsCommand } from './sequence-animatic-keyframe-workflows-command.ts'
import { runSequenceAnimaticSceneWorkflowCommand } from './sequence-animatic-scene-workflow-command.ts'
import { runSequenceAnimaticShotCoverageIntentsCommand } from './sequence-animatic-shot-coverage-intents-command.ts'
import { runSequenceAnimaticShotProductionGraphCommand } from './sequence-animatic-shot-production-graph-command.ts'
import { runSequenceAnimaticShotRevisionWorkflowCommand } from './sequence-animatic-shot-revision-workflow-command.ts'
import { runSequenceAnimaticZoneCoverageBoardsCommand } from './sequence-animatic-zone-coverage-boards-command.ts'
import { sequenceAnimaticSceneBoardWorkflowCommandRequestSchema } from '../../../src/domain/outputWorkflow.ts'
import {
  listWorkflowCommandManifests,
  type ParsedWorkflowCommand,
  type WorkflowCommandAction,
} from '../../../src/domain/workflowCommandRegistry.ts'

export type WorkflowCommandHandlerContext = {
  client: {
    from: (table: string) => any
  }
  admin: {
    from: (table: string) => any
    rpc: (fn: string, args?: Record<string, unknown>) => any
  }
  userId: string
  payload: unknown
  parsed: ParsedWorkflowCommand
}

export type WorkflowCommandHandler = (context: WorkflowCommandHandlerContext) => Promise<unknown>

export const workflowCommandHandlers = {
  prepare_scene_board: async ({ client, admin, userId, payload }) => runSceneBoardWorkflowCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload: sequenceAnimaticSceneBoardWorkflowCommandRequestSchema.parse(payload),
    startedBy: 'start-workflow-command',
  }),
  regenerate_scene_board_zone: async ({ client, admin, userId, payload }) => runSceneBoardWorkflowCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload: sequenceAnimaticSceneBoardWorkflowCommandRequestSchema.parse(payload),
    startedBy: 'start-workflow-command',
  }),
  generate_coverage_intents: async ({ client, admin, userId, payload }) => runSequenceAnimaticShotCoverageIntentsCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  generate_spot_angle_coverage: async ({ client, admin, userId, payload }) => runSceneBoardWorkflowCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload: sequenceAnimaticSceneBoardWorkflowCommandRequestSchema.parse(payload),
    startedBy: 'start-workflow-command',
  }),
  generate_zone_coverage_grids: async ({ client, admin, userId, payload }) => runSequenceAnimaticZoneCoverageBoardsCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  generate_coverage_anchors: async ({ client, admin, userId, payload }) => runSequenceAnimaticKeyframeWorkflowsCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  prepare_storyboard_blocks: async ({ client, admin, userId, payload }) => runSequenceAnimaticBlockWorkflowCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  prepare_scene_shot_plans: async ({ admin, payload }) => runSequenceAnimaticSceneWorkflowCommand({
    admin: admin as never,
    payload,
  }),
  prepare_continuity_workflow: async ({ client, admin, userId, payload }) => runSequenceAnimaticContinuityWorkflowCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  prepare_shot_production_graph: async ({ client, admin, userId, payload }) => runSequenceAnimaticShotProductionGraphCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  generate_keyframes: async ({ client, admin, userId, payload }) => runSequenceAnimaticKeyframeWorkflowsCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  generate_shot_video: async ({ client, admin, userId, payload }) => runSequenceAnimaticBlockWorkflowCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  revise_shot: async ({ client, admin, userId, payload }) => runSequenceAnimaticShotRevisionWorkflowCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
  generate_continuity_assets: async ({ client, admin, userId, payload }) => runSequenceAnimaticContinuityAssetWorkflowCommand({
    client: client as never,
    admin: admin as never,
    userId,
    payload,
  }),
} satisfies Record<WorkflowCommandAction, WorkflowCommandHandler>

export function assertWorkflowCommandHandlerCoverage() {
  const manifestActions = new Set(listWorkflowCommandManifests().map((manifest) => manifest.action))
  const handlerActions = Object.keys(workflowCommandHandlers)
  const missingHandlers = [...manifestActions]
    .filter((action) => !workflowCommandHandlers[action])
  if (missingHandlers.length > 0) {
    throw new Error(`Missing workflow command handler(s): ${missingHandlers.join(', ')}`)
  }

  const extraHandlers = handlerActions
    .filter((action) => !manifestActions.has(action as WorkflowCommandAction))
  if (extraHandlers.length > 0) {
    throw new Error(`Unknown workflow command handler(s): ${extraHandlers.join(', ')}`)
  }
}

export async function runWorkflowCommandHandler(context: WorkflowCommandHandlerContext) {
  assertWorkflowCommandHandlerCoverage()
  const handler = workflowCommandHandlers[context.parsed.action]
  if (!handler) throw new Error(`Workflow command handler is not implemented: ${context.parsed.family}:${context.parsed.action}`)
  return handler(context)
}
