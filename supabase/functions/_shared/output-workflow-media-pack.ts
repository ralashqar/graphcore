import { defineWorkflowNodePack } from '../../../src/domain/workflowNodeHandlerRegistry.ts'
import type {
  WorkflowMediaNodeExecutionContext,
  WorkflowMediaNodeExecutionResult,
  WorkflowMediaRuntime,
} from './output-workflow-media-runtime.ts'

async function imageGeneration(
  context: WorkflowMediaNodeExecutionContext,
  runtime: WorkflowMediaRuntime,
) {
  return runtime.executeImageGeneration(context)
}

async function videoGeneration(
  context: WorkflowMediaNodeExecutionContext,
  runtime: WorkflowMediaRuntime,
) {
  return runtime.executeVideoGeneration(context)
}

const mediaHandlers = {
  cinematic_beat_sheet: imageGeneration,
  cinematic_block_video: videoGeneration,
  cinematic_keyframe: imageGeneration,
  cinematic_v2_shot_keyframe: imageGeneration,
  cinematic_v2_shot_video: videoGeneration,
  cinematic_v2_storyboard_sheet: imageGeneration,
  cinematic_v3_storyboard_group_video: videoGeneration,
  cinematic_v3_storyboard_sheet: imageGeneration,
  comic_page: imageGeneration,
  concept_art_image: imageGeneration,
  ebook_cover_image: imageGeneration,
  poster_image: imageGeneration,
  sequence_animatic_character_anchor_atlas: imageGeneration,
  sequence_animatic_continuity_asset_image: imageGeneration,
  sequence_animatic_continuity_batch_image: imageGeneration,
  sequence_animatic_coverage_anchor_image: imageGeneration,
  sequence_animatic_location_anchor_atlas: imageGeneration,
  sequence_animatic_prop_anchor_atlas: imageGeneration,
  sequence_animatic_zone_coverage_board_image: imageGeneration,
}

export const workflowMediaNodePack = defineWorkflowNodePack<
  WorkflowMediaNodeExecutionContext,
  WorkflowMediaNodeExecutionResult,
  WorkflowMediaRuntime,
  typeof mediaHandlers
>({
  packKey: 'output_workflow_media',
  handlers: mediaHandlers,
})

export const workflowMediaNodeHandlerKeys = workflowMediaNodePack.handlerKeys

export function registerWorkflowMediaNodePack(input: {
  runtime: WorkflowMediaRuntime
  register: (handlerKey: string, handler: (context: WorkflowMediaNodeExecutionContext) => Promise<WorkflowMediaNodeExecutionResult>) => void
}) {
  workflowMediaNodePack.register({
    dependencies: input.runtime,
    register: input.register,
  })
}
