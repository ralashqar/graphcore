type LooseRecord = Record<string, unknown>

export type DynamicWorkflowGraphWorkflow = {
  id: string
  draftId: string
  metadata?: LooseRecord
}

export type DynamicWorkflowGraphNodeRow = {
  id?: string
  key?: string
  node_type?: string
  config?: unknown
  outputs?: unknown
  dirty?: boolean
  input_hash?: string | null
  output_hash?: string | null
  metadata?: unknown
}

export type DynamicWorkflowGraphRunStepRow = {
  node_key?: string
  outputs?: unknown
  metadata?: unknown
  output_hash?: string | null
  input_hash?: string | null
  status?: string | null
  provider?: string | null
  model?: string | null
}

export type DynamicWorkflowGraphDatabaseClient = {
  from: (table: string) => {
    delete: () => {
      eq: (column: string, value: unknown) => {
        in: (column: string, values: unknown[]) => Promise<{ error: { message: string } | null }>
      }
    }
    upsert: (rows: LooseRecord[], options?: LooseRecord) => Promise<{ error: { message: string } | null }>
    update: (values: LooseRecord) => {
      eq: (column: string, value: unknown) => Promise<{ error: { message: string } | null }>
    }
  }
}

export type DynamicWorkflowGraphRuntimeHelpers = {
  asRecord: (value: unknown) => LooseRecord
  readText: (value: unknown) => string
  hashValue: (value: unknown) => string
  hasStoredOutputs: (value: LooseRecord) => boolean
  buildOutputPreview: (input: {
    node: { key: string; nodeType: string; outputHash: string }
    outputs: LooseRecord
    provider: string | null
    model: string | null
  }) => LooseRecord
}

export function dynamicWorkflowNodeRow(input: {
  workflow: DynamicWorkflowGraphWorkflow
  key: string
  nodeType: string
  label: string
  x: number
  y: number
  config: LooseRecord
  compileHash: string
  generatedByNodeKey?: string
}) {
  return {
    workflow_id: input.workflow.id,
    draft_id: input.workflow.draftId,
    key: input.key,
    node_type: input.nodeType,
    label: input.label,
    position: { x: input.x, y: input.y },
    config: input.config,
    inputs: {},
    outputs: {},
    dirty: true,
    input_hash: '',
    output_hash: '',
    metadata: {
      dynamicCinematicGenerated: true,
      dynamicCompileHash: input.compileHash,
      generatedByNodeKey: input.generatedByNodeKey ?? 'cinematic_dynamic_take_fanout',
    },
  }
}

export function dynamicWorkflowEdgeRow(input: {
  workflow: DynamicWorkflowGraphWorkflow
  key: string
  sourceNodeKey: string
  sourcePort: string
  targetNodeKey: string
  targetPort: string
  compileHash: string
  metadata?: LooseRecord
  generatedByNodeKey?: string
}) {
  return {
    workflow_id: input.workflow.id,
    draft_id: input.workflow.draftId,
    key: input.key,
    source_node_key: input.sourceNodeKey,
    source_port: input.sourcePort,
    target_node_key: input.targetNodeKey,
    target_port: input.targetPort,
    metadata: {
      dynamicCinematicGenerated: true,
      dynamicCompileHash: input.compileHash,
      generatedByNodeKey: input.generatedByNodeKey ?? 'cinematic_dynamic_take_fanout',
      ...(input.metadata ?? {}),
    },
  }
}

export function preserveExistingDynamicWorkflowNodeOutput(input: {
  nextRow: LooseRecord
  existingNode: DynamicWorkflowGraphNodeRow | null | undefined
  existingStep?: DynamicWorkflowGraphRunStepRow | null
  preserve: boolean
  compileHash: string
  helpers: DynamicWorkflowGraphRuntimeHelpers
}) {
  const { helpers } = input
  if (!input.preserve || !input.existingNode) return input.nextRow
  const existingMetadata = helpers.asRecord(input.existingNode.metadata)
  const nextConfigHash = helpers.hashValue(helpers.asRecord(input.nextRow.config))
  const existingConfigHash = helpers.hashValue(helpers.asRecord(input.existingNode.config))
  if (nextConfigHash !== existingConfigHash) {
    return {
      ...input.nextRow,
      metadata: {
        ...helpers.asRecord(input.nextRow.metadata),
        invalidatedPreviousOutput: true,
        invalidatedReason: 'dynamic_node_config_changed',
        previousDynamicCompileHash: helpers.readText(existingMetadata.dynamicCompileHash),
        previousConfigHash: existingConfigHash,
        nextConfigHash,
      },
    }
  }
  const existingOutputs = helpers.asRecord(input.existingNode.outputs)
  const existingPreview = helpers.asRecord(existingMetadata.outputPreview)
  const existingOutputHash = helpers.readText(input.existingNode.output_hash)
  const stepOutputs = helpers.asRecord(input.existingStep?.outputs)
  const stepMetadata = helpers.asRecord(input.existingStep?.metadata)
  const stepOutputHash = helpers.readText(input.existingStep?.output_hash)
  const stepHasOutput = Boolean(stepOutputHash) || helpers.hasStoredOutputs(stepOutputs)
  const useStepOutput = !existingOutputHash && !helpers.hasStoredOutputs(existingOutputs) && stepHasOutput
  const preservedOutputs = useStepOutput ? stepOutputs : existingOutputs
  const preservedOutputHash = useStepOutput ? stepOutputHash : existingOutputHash
  const preservedInputHash = useStepOutput ? helpers.readText(input.existingStep?.input_hash) : helpers.readText(input.existingNode.input_hash)
  const preservedPreview = Object.keys(existingPreview).length > 0
    ? existingPreview
    : Object.keys(helpers.asRecord(stepMetadata.outputPreview)).length > 0
      ? helpers.asRecord(stepMetadata.outputPreview)
      : preservedOutputHash
        ? helpers.buildOutputPreview({
          node: {
            key: helpers.readText(input.nextRow.key),
            nodeType: helpers.readText(input.nextRow.node_type),
            outputHash: preservedOutputHash,
          },
          outputs: preservedOutputs,
          provider: useStepOutput ? helpers.readText(input.existingStep?.provider) || null : null,
          model: useStepOutput ? helpers.readText(input.existingStep?.model) || null : null,
        })
        : {}
  const stepCompleted = ['completed', 'completed_with_errors'].includes(helpers.readText(input.existingStep?.status))
  return {
    ...input.nextRow,
    outputs: preservedOutputs,
    dirty: useStepOutput ? !stepCompleted : input.existingNode.dirty === true,
    input_hash: preservedInputHash,
    output_hash: preservedOutputHash,
    metadata: {
      ...helpers.asRecord(input.nextRow.metadata),
      execution: helpers.asRecord(existingMetadata.execution),
      outputPreview: preservedPreview,
      preservedDuringDynamicRematerialization: true,
      preservedDuringSelectedShotMaterialization: true,
      preservedFromRunStep: useStepOutput,
      preservedFromDynamicCompileHash: helpers.readText(existingMetadata.dynamicCompileHash),
      dynamicCompileHash: input.compileHash,
    },
  }
}

export async function persistDynamicWorkflowGraphRevisionRuntime(input: {
  client: DynamicWorkflowGraphDatabaseClient
  workflow: DynamicWorkflowGraphWorkflow
  nodeRows: LooseRecord[]
  edgeRows: LooseRecord[]
  existingDynamicNodes: DynamicWorkflowGraphNodeRow[]
  dynamicEdgeKeys: string[]
  compileHash: string
  staleReason: string
  workflowMetadataPatch: LooseRecord
  helpers: Pick<DynamicWorkflowGraphRuntimeHelpers, 'asRecord' | 'readText'>
}) {
  const uniqueDynamicEdgeKeys = Array.from(new Set(input.dynamicEdgeKeys.filter(Boolean)))
  if (uniqueDynamicEdgeKeys.length > 0) {
    const deleteEdges = await input.client
      .from('output_workflow_edges')
      .delete()
      .eq('workflow_id', input.workflow.id)
      .in('key', uniqueDynamicEdgeKeys)
    if (deleteEdges.error) throw new Error(deleteEdges.error.message)
  }

  if (input.nodeRows.length > 0) {
    const insertNodes = await input.client
      .from('output_workflow_nodes')
      .upsert(input.nodeRows, { onConflict: 'workflow_id,key' })
    if (insertNodes.error) throw new Error(insertNodes.error.message)
  }

  if (input.edgeRows.length > 0) {
    const insertEdges = await input.client
      .from('output_workflow_edges')
      .upsert(input.edgeRows, { onConflict: 'workflow_id,key' })
    if (insertEdges.error) throw new Error(insertEdges.error.message)
  }

  const nextDynamicNodeKeys = new Set(input.nodeRows.map((row) => input.helpers.readText(row.key)))
  const obsoleteDynamicNodes = input.existingDynamicNodes.filter((row) => !nextDynamicNodeKeys.has(row.key ?? ''))
  if (obsoleteDynamicNodes.length > 0) {
    const staleAt = new Date().toISOString()
    for (const obsoleteNode of obsoleteDynamicNodes) {
      const markStale = await input.client
        .from('output_workflow_nodes')
        .update({
          dirty: true,
          metadata: {
            ...input.helpers.asRecord(obsoleteNode.metadata),
            dynamicCinematicStale: true,
            staleAt,
            staleReason: input.staleReason,
            replacedByDynamicCompileHash: input.compileHash,
          },
        })
        .eq('id', obsoleteNode.id)
      if (markStale.error) throw new Error(markStale.error.message)
    }
  }

  const updateWorkflow = await input.client.from('output_workflows').update({
    metadata: {
      ...input.workflow.metadata,
      ...input.workflowMetadataPatch,
      lastDynamicGraphUpdatedAt: new Date().toISOString(),
      dynamicNodeCount: input.nodeRows.length,
    },
  }).eq('id', input.workflow.id)
  if (updateWorkflow.error) throw new Error(updateWorkflow.error.message)
}
