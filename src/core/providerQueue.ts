function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function readProviderQueueUrl(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export type ProviderQueueHandle = {
  providerRequestId: string | null
  statusUrl: string | null
  responseUrl: string | null
  cancelUrl: string | null
  submittedAt: string | null
  webhookStatus: string | null
  webhookReceivedAt: string | null
  webhookGatewayRequestId: string | null
}

type ProviderQueueOverrides = {
  providerRequestId?: unknown
  statusUrl?: unknown
  responseUrl?: unknown
  cancelUrl?: unknown
}

function readQueueContext(value: unknown) {
  const context = asRecord(value)
  const nestedQueue = asRecord(context.providerQueue)
  const workflowQueue = asRecord(asRecord(context.workflow).providerQueue)

  return {
    context,
    nestedQueue,
    workflowQueue,
  }
}

export function normalizeProviderQueueHandle(input: {
  resultContext?: Record<string, unknown> | null | undefined
  overrides?: ProviderQueueOverrides
}): ProviderQueueHandle {
  const { context, nestedQueue, workflowQueue } = readQueueContext(input.resultContext)

  return {
    providerRequestId:
      readProviderQueueUrl(input.overrides?.providerRequestId)
      ?? readProviderQueueUrl(workflowQueue.providerRequestId)
      ?? readProviderQueueUrl(nestedQueue.providerRequestId)
      ?? readProviderQueueUrl(context.providerRequestId)
      ?? readProviderQueueUrl(context.requestId),
    statusUrl:
      readProviderQueueUrl(input.overrides?.statusUrl)
      ?? readProviderQueueUrl(workflowQueue.statusUrl)
      ?? readProviderQueueUrl(nestedQueue.statusUrl)
      ?? readProviderQueueUrl(context.statusUrl),
    responseUrl:
      readProviderQueueUrl(input.overrides?.responseUrl)
      ?? readProviderQueueUrl(workflowQueue.responseUrl)
      ?? readProviderQueueUrl(nestedQueue.responseUrl)
      ?? readProviderQueueUrl(context.responseUrl),
    cancelUrl:
      readProviderQueueUrl(input.overrides?.cancelUrl)
      ?? readProviderQueueUrl(workflowQueue.cancelUrl)
      ?? readProviderQueueUrl(nestedQueue.cancelUrl)
      ?? readProviderQueueUrl(context.cancelUrl),
    submittedAt:
      readProviderQueueUrl(workflowQueue.submittedAt)
      ?? readProviderQueueUrl(nestedQueue.submittedAt)
      ?? readProviderQueueUrl(context.submittedAt),
    webhookStatus:
      readProviderQueueUrl(workflowQueue.webhookStatus)
      ?? readProviderQueueUrl(nestedQueue.webhookStatus)
      ?? readProviderQueueUrl(context.webhookStatus),
    webhookReceivedAt:
      readProviderQueueUrl(workflowQueue.webhookReceivedAt)
      ?? readProviderQueueUrl(nestedQueue.webhookReceivedAt)
      ?? readProviderQueueUrl(context.webhookReceivedAt),
    webhookGatewayRequestId:
      readProviderQueueUrl(workflowQueue.webhookGatewayRequestId)
      ?? readProviderQueueUrl(nestedQueue.webhookGatewayRequestId)
      ?? readProviderQueueUrl(context.webhookGatewayRequestId),
  }
}

export function hasProviderQueueHandle(handle: ProviderQueueHandle | null | undefined) {
  if (!handle) return false
  return Boolean(handle.providerRequestId || handle.statusUrl || handle.responseUrl || handle.cancelUrl)
}

export function buildProviderQueueColumns(handle: ProviderQueueHandle) {
  return {
    provider_request_id: handle.providerRequestId,
    status_url: handle.statusUrl,
    response_url: handle.responseUrl,
    cancel_url: handle.cancelUrl,
  }
}

export function buildProviderQueueResultContextPatch(handle: ProviderQueueHandle) {
  return {
    providerRequestId: handle.providerRequestId,
    requestId: handle.providerRequestId,
    statusUrl: handle.statusUrl,
    responseUrl: handle.responseUrl,
    cancelUrl: handle.cancelUrl,
    submittedAt: handle.submittedAt,
    webhookStatus: handle.webhookStatus,
    webhookReceivedAt: handle.webhookReceivedAt,
    webhookGatewayRequestId: handle.webhookGatewayRequestId,
    providerQueue: handle,
  }
}

export function extractProviderQueueHandleFromBody(body: Record<string, unknown>) {
  const urls = asRecord(body.urls)
  return {
    providerRequestId:
      readProviderQueueUrl(body.request_id)
      ?? readProviderQueueUrl(body.requestId),
    statusUrl:
      readProviderQueueUrl(body.status_url)
      ?? readProviderQueueUrl(body.statusUrl)
      ?? readProviderQueueUrl(urls.status)
      ?? readProviderQueueUrl(urls.status_url),
    responseUrl:
      readProviderQueueUrl(body.response_url)
      ?? readProviderQueueUrl(body.responseUrl)
      ?? readProviderQueueUrl(urls.response)
      ?? readProviderQueueUrl(urls.response_url),
    cancelUrl:
      readProviderQueueUrl(body.cancel_url)
      ?? readProviderQueueUrl(body.cancelUrl)
      ?? readProviderQueueUrl(urls.cancel)
      ?? readProviderQueueUrl(urls.cancel_url),
    submittedAt: null,
    webhookStatus: null,
    webhookReceivedAt: null,
    webhookGatewayRequestId: null,
  } satisfies ProviderQueueHandle
}
