import {
  buildOutputWorkflowExecutionPlan,
  getOutputWorkflowNodeExecutionMetadata,
  isOutputWorkflowProviderBackedNodeType,
  outputWorkflowNodeRegistry,
  type OutputWorkflowEdge,
  type OutputWorkflowNode,
  type OutputWorkflowRunStep,
} from './outputWorkflow.ts'

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function outputWorkflowStepStatusKey(step: Pick<OutputWorkflowRunStep, 'status' | 'metadata'> | null | undefined) {
  if (!step) return 'queued'
  const metadata = readRecord(step.metadata)
  if (metadata.blocked) return 'blocked'
  if (metadata.skipped) return 'skipped'
  return step.status
}

export function buildOutputWorkflowTargetedRunMetadata(nodeKey: string, sourceRunId?: string | null) {
  return {
    ...(sourceRunId ? { sourceRunId } : {}),
    runMode: 'targeted_node_preview',
    targetNodeKeys: [nodeKey],
    forceNodeKeys: [nodeKey],
  }
}

export function buildOutputWorkflowGraphViewModel(input: {
  nodes: OutputWorkflowNode[]
  edges: OutputWorkflowEdge[]
  steps?: OutputWorkflowRunStep[]
}) {
  const stepsByNodeKey = new Map((input.steps ?? []).map((step) => [step.nodeKey, step]))
  const plan = buildOutputWorkflowExecutionPlan(input.nodes, input.edges)
  const levelByNodeKey = new Map(plan.levels.flatMap((level, levelIndex) => level.map((nodeKey) => [nodeKey, levelIndex] as const)))

  return {
    diagnostics: plan.diagnostics,
    levels: plan.levels,
    nodes: input.nodes.map((node) => {
      const step = stepsByNodeKey.get(node.key) ?? null
      const execution = getOutputWorkflowNodeExecutionMetadata(node)
      const definition = outputWorkflowNodeRegistry[node.nodeType]
      return {
        key: node.key,
        label: node.label,
        nodeType: node.nodeType,
        nodeTypeLabel: definition.label,
        purpose: typeof node.config.purpose === 'string' ? node.config.purpose : '',
        status: outputWorkflowStepStatusKey(step),
        resourceClass: execution.resourceClass,
        groupKey: execution.groupKey ?? '',
        providerBacked: isOutputWorkflowProviderBackedNodeType(node.nodeType),
        dirty: node.dirty,
        level: levelByNodeKey.get(node.key) ?? 0,
        position: node.position,
      }
    }),
    edges: input.edges.map((edge) => ({
      key: edge.key,
      sourceNodeKey: edge.sourceNodeKey,
      targetNodeKey: edge.targetNodeKey,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      valueType: typeof edge.metadata.valueType === 'string' ? edge.metadata.valueType : '',
    })),
  }
}

export function buildOutputWorkflowLevelLayout(input: {
  nodes: OutputWorkflowNode[]
  edges: OutputWorkflowEdge[]
  nodeWidth?: number
  nodeHeight?: number
  columnGap?: number
  rowGap?: number
}) {
  const nodeWidth = input.nodeWidth ?? 280
  const nodeHeight = input.nodeHeight ?? 154
  const columnGap = input.columnGap ?? 130
  const rowGap = input.rowGap ?? 40
  const plan = buildOutputWorkflowExecutionPlan(input.nodes, input.edges)
  const positions = new Map<string, { x: number; y: number }>()
  plan.levels.forEach((level, levelIndex) => {
    const totalHeight = (level.length * nodeHeight) + Math.max(0, level.length - 1) * rowGap
    const top = -totalHeight / 2
    level.forEach((nodeKey, rowIndex) => {
      positions.set(nodeKey, {
        x: levelIndex * (nodeWidth + columnGap),
        y: top + rowIndex * (nodeHeight + rowGap),
      })
    })
  })
  return positions
}
