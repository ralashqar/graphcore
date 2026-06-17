import type { WorkflowNodeManifest } from './outputWorkflowManifests.ts'

export type WorkflowNodeHandler<TContext = unknown, TResult = unknown> = (context: TContext) => Promise<TResult> | TResult

export type WorkflowNodeHandlerRegistry<TContext = unknown, TResult = unknown> = Map<string, WorkflowNodeHandler<TContext, TResult>>

export function createWorkflowNodeHandlerRegistry<TContext = unknown, TResult = unknown>(
  entries: Array<[string, WorkflowNodeHandler<TContext, TResult>]> = [],
): WorkflowNodeHandlerRegistry<TContext, TResult> {
  const registry = new Map<string, WorkflowNodeHandler<TContext, TResult>>()
  for (const [handlerKey, handler] of entries) {
    registerWorkflowNodeHandler(registry, handlerKey, handler)
  }
  return registry
}

export function registerWorkflowNodeHandler<TContext, TResult>(
  registry: WorkflowNodeHandlerRegistry<TContext, TResult>,
  handlerKey: string,
  handler: WorkflowNodeHandler<TContext, TResult>,
  options: { replace?: boolean } = {},
) {
  const key = handlerKey.trim()
  if (!key) throw new Error('Workflow node handler key is required.')
  if (!options.replace && registry.has(key)) throw new Error(`Workflow node handler already registered: ${key}`)
  registry.set(key, handler)
  return handler
}

export function getWorkflowNodeHandler<TContext, TResult>(
  registry: WorkflowNodeHandlerRegistry<TContext, TResult>,
  handlerKey: string | null | undefined,
) {
  const key = typeof handlerKey === 'string' ? handlerKey.trim() : ''
  return key ? registry.get(key) ?? null : null
}

export function assertWorkflowNodeHandlerCoverage(
  manifests: readonly WorkflowNodeManifest[],
  registry: WorkflowNodeHandlerRegistry,
) {
  const missing = manifests
    .filter((manifest) => manifest.executable)
    .filter((manifest) => !registry.has(manifest.handlerKey))
    .map((manifest) => `${manifest.purpose} -> ${manifest.handlerKey}`)
    .sort()
  if (missing.length > 0) {
    throw new Error(`Missing workflow node handler(s): ${missing.join(', ')}`)
  }
}
