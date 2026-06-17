import type { WorkflowNodeManifest } from './outputWorkflowManifests.ts'

export type WorkflowNodeHandler<TContext = unknown, TResult = unknown> = (context: TContext) => Promise<TResult> | TResult

export type WorkflowNodeHandlerRegistry<TContext = unknown, TResult = unknown> = Map<string, WorkflowNodeHandler<TContext, TResult>>

export type WorkflowNodePackHandler<TContext, TResult, TDependencies> = (
  context: TContext,
  dependencies: TDependencies,
) => Promise<TResult> | TResult

export type WorkflowNodePackDefinition<TContext, TResult, TDependencies> = {
  packKey: string
  handlerKeys: string[]
  register(input: {
    dependencies: TDependencies
    register: (handlerKey: string, handler: (context: TContext) => Promise<TResult>) => void
  }): void
}

export function defineWorkflowNodePack<
  TContext,
  TResult,
  TDependencies,
  THandlers extends Record<string, WorkflowNodePackHandler<TContext, TResult, TDependencies>>,
>(input: {
  packKey: string
  handlers: THandlers
}): WorkflowNodePackDefinition<TContext, TResult, TDependencies> {
  const packKey = input.packKey.trim()
  if (!packKey) throw new Error('Workflow node pack key is required.')
  const handlerKeys = Object.keys(input.handlers).map((key) => key.trim())
  const emptyKeys = handlerKeys.filter((key) => !key)
  if (emptyKeys.length > 0) throw new Error(`Workflow node pack "${packKey}" includes an empty handler key.`)
  const duplicateKeys = handlerKeys
    .filter((key, index) => handlerKeys.indexOf(key) !== index)
    .sort()
  if (duplicateKeys.length > 0) {
    throw new Error(`Workflow node pack "${packKey}" includes duplicate handler key(s): ${[...new Set(duplicateKeys)].join(', ')}`)
  }
  return {
    packKey,
    handlerKeys,
    register(registerInput) {
      for (const handlerKey of handlerKeys) {
        const handler = input.handlers[handlerKey]
        if (!handler) throw new Error(`Workflow node pack "${packKey}" is missing handler "${handlerKey}".`)
        registerInput.register(handlerKey, async (context) => handler(context, registerInput.dependencies))
      }
    },
  }
}

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

export function assertWorkflowNodePackManifestCoverage(input: {
  pack: Pick<WorkflowNodePackDefinition<unknown, unknown, unknown>, 'packKey' | 'handlerKeys'>
  manifests: readonly WorkflowNodeManifest[]
  expectedPurposes?: readonly string[]
  allowExtraHandlers?: boolean
}) {
  const executableManifests = input.manifests.filter((manifest) => manifest.executable)
  const executableHandlerKeys = new Set(executableManifests.map((manifest) => manifest.handlerKey))
  const packHandlerKeys = new Set(input.pack.handlerKeys)
  const unknownHandlerKeys = input.pack.handlerKeys
    .filter((handlerKey) => !executableHandlerKeys.has(handlerKey))
    .sort()
  if (unknownHandlerKeys.length > 0) {
    throw new Error(`Workflow node pack "${input.pack.packKey}" has handler key(s) without executable manifests: ${unknownHandlerKeys.join(', ')}`)
  }

  if (!input.expectedPurposes) return

  const manifestByPurpose = new Map(executableManifests.map((manifest) => [manifest.purpose, manifest] as const))
  const missingPurposes = input.expectedPurposes
    .filter((purpose) => !manifestByPurpose.has(purpose))
    .sort()
  if (missingPurposes.length > 0) {
    throw new Error(`Workflow node pack "${input.pack.packKey}" expected purpose(s) without executable manifests: ${missingPurposes.join(', ')}`)
  }

  const expectedHandlerKeys = new Set(input.expectedPurposes
    .map((purpose) => manifestByPurpose.get(purpose)?.handlerKey)
    .filter((handlerKey): handlerKey is string => Boolean(handlerKey)))
  const missingHandlerKeys = [...expectedHandlerKeys]
    .filter((handlerKey) => !packHandlerKeys.has(handlerKey))
    .sort()
  if (missingHandlerKeys.length > 0) {
    throw new Error(`Workflow node pack "${input.pack.packKey}" is missing expected manifest handler key(s): ${missingHandlerKeys.join(', ')}`)
  }

  if (input.allowExtraHandlers === true) return

  const extraHandlerKeys = input.pack.handlerKeys
    .filter((handlerKey) => !expectedHandlerKeys.has(handlerKey))
    .sort()
  if (extraHandlerKeys.length > 0) {
    throw new Error(`Workflow node pack "${input.pack.packKey}" has handler key(s) outside expected purposes: ${extraHandlerKeys.join(', ')}`)
  }
}
