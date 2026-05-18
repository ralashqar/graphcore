export function sequenceAnimaticStoryboardImageSize(columns: number, rows: number, aspectRatio: string) {
  const cellWidth = aspectRatio === '9:16' || aspectRatio === '3:4' ? 864 : 960
  const cellHeight = aspectRatio === '9:16' ? 1536 : aspectRatio === '1:1' ? 1024 : 540
  return {
    width: Math.max(1024, Math.min(4096, columns * cellWidth)),
    height: Math.max(1024, Math.min(4096, rows * cellHeight)),
  }
}

export function providerSafeSequenceAnimaticVideoDurationSeconds(value: unknown) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return 5
  if (seconds <= 5) return 5
  if (seconds <= 10) return 10
  return 15
}

export function sequenceAnimaticWorkflowNode(
  workflowId: string,
  draftId: string,
  key: string,
  nodeType: string,
  label: string,
  x: number,
  y: number,
  config: Record<string, unknown>,
  inputs: Record<string, unknown> = {},
  sequenceAnimaticRole = 'storyboard_block',
) {
  return {
    workflow_id: workflowId,
    draft_id: draftId,
    key,
    node_type: nodeType,
    label,
    position: { x, y },
    config,
    inputs,
    outputs: {},
    dirty: true,
    input_hash: '',
    output_hash: '',
    metadata: {
      sequenceAnimaticGenerated: true,
      screenplayAnimaticRole: typeof config.screenplayAnimaticRole === 'string' ? config.screenplayAnimaticRole : sequenceAnimaticRole,
      screenplayAnimaticSource: typeof config.screenplayAnimaticSource === 'string' ? config.screenplayAnimaticSource : null,
      sequenceAnimaticRole,
    },
  }
}

export function sequenceAnimaticWorkflowEdge(
  workflowId: string,
  draftId: string,
  key: string,
  sourceNodeKey: string,
  sourcePort: string,
  targetNodeKey: string,
  targetPort: string,
  metadata: Record<string, unknown> = {},
  sequenceAnimaticRole = 'storyboard_block',
) {
  return {
    workflow_id: workflowId,
    draft_id: draftId,
    key,
    source_node_key: sourceNodeKey,
    source_port: sourcePort,
    target_node_key: targetNodeKey,
    target_port: targetPort,
    metadata: {
      sequenceAnimaticGenerated: true,
      screenplayAnimaticRole: sequenceAnimaticRole,
      screenplayAnimaticSource: typeof metadata.screenplayAnimaticSource === 'string' ? metadata.screenplayAnimaticSource : null,
      sequenceAnimaticRole,
      ...metadata,
    },
  }
}
