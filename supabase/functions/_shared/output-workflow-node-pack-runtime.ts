export type WorkflowNodePackExecutionContext = {
  inputHash: string
}

export type WorkflowNodePackResultHelpers = {
  hashOutputWorkflowValue: (value: unknown) => string
}

export type WorkflowNodePackExecutionResult = {
  status?: string
  inputHash: string
  outputHash: string
  outputs: Record<string, unknown>
  provider: string
  model: string
  providerRequestId?: string
}

export function createWorkflowNodeExecutionResult<TResult extends WorkflowNodePackExecutionResult = WorkflowNodePackExecutionResult>(input: {
  context: WorkflowNodePackExecutionContext
  helpers: WorkflowNodePackResultHelpers
  outputs: Record<string, unknown>
  model: string
  provider?: string | null
  providerRequestId?: string | null
  status?: string
}): TResult {
  return {
    status: input.status,
    inputHash: input.context.inputHash,
    outputHash: input.helpers.hashOutputWorkflowValue(input.outputs),
    outputs: input.outputs,
    provider: input.provider || 'graphcore',
    model: input.model,
    providerRequestId: input.providerRequestId || undefined,
  } as TResult
}
