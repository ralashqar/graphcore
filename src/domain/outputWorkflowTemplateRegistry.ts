import { z } from 'zod'

import type { WorkflowTemplateManifest } from './outputWorkflowManifests.ts'

export type WorkflowTemplateGraphRows = {
  nodes: Array<{ key: string; config?: unknown } & Record<string, unknown>>
  edges: Array<Record<string, unknown>>
}

export type WorkflowTemplateRegistryEntry<TInput = unknown, TGraph extends WorkflowTemplateGraphRows = WorkflowTemplateGraphRows> =
  WorkflowTemplateManifest<TInput, TGraph>
export type AnyWorkflowTemplateRegistryEntry = WorkflowTemplateRegistryEntry<any, any>

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(',')}}`
}

export function workflowTemplateSourceHash(value: unknown) {
  const input = stableStringify(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function createWorkflowTemplateRegistry(entries: AnyWorkflowTemplateRegistryEntry[] = []) {
  const templates = new Map<string, AnyWorkflowTemplateRegistryEntry>()
  for (const entry of entries) registerWorkflowTemplateManifest(templates, entry)
  return templates
}

export function registerWorkflowTemplateManifest(
  registry: Map<string, AnyWorkflowTemplateRegistryEntry>,
  manifest: AnyWorkflowTemplateRegistryEntry,
) {
  const key = manifest.key.trim()
  if (!key) throw new Error('Workflow template manifest key is required.')
  if (registry.has(key)) throw new Error(`Workflow template manifest already registered: ${key}`)
  registry.set(key, manifest)
  return manifest
}

export function getWorkflowTemplateManifest(registry: Map<string, AnyWorkflowTemplateRegistryEntry>, key: string | null | undefined) {
  const normalized = typeof key === 'string' ? key.trim() : ''
  return normalized ? registry.get(normalized) ?? null : null
}

export function normalizeWorkflowTemplateGraphRows<TGraph extends WorkflowTemplateGraphRows>(graph: TGraph) {
  return {
    nodes: graph.nodes.map((node) => ({
      ...node,
      key: String(node.key ?? ''),
      nodeType: String(node.nodeType ?? node.node_type ?? ''),
      config: node.config ?? {},
      inputs: node.inputs ?? {},
      metadata: node.metadata ?? {},
    })),
    edges: graph.edges.map((edge) => ({
      ...edge,
      sourceNodeKey: String(edge.sourceNodeKey ?? edge.source_node_key ?? ''),
      sourcePort: String(edge.sourcePort ?? edge.source_port ?? ''),
      targetNodeKey: String(edge.targetNodeKey ?? edge.target_node_key ?? ''),
      targetPort: String(edge.targetPort ?? edge.target_port ?? ''),
      metadata: edge.metadata ?? {},
    })),
  }
}

export function buildWorkflowTemplateGraph<TInput, TGraph extends WorkflowTemplateGraphRows>(input: {
  registry: Map<string, AnyWorkflowTemplateRegistryEntry>
  templateKey: string
  rawInput: unknown
  validateGraph: (graph: TGraph) => { ok: boolean; diagnostics: string[] }
}) {
  const manifest = getWorkflowTemplateManifest(input.registry, input.templateKey)
  if (!manifest) {
    return {
      ok: false as const,
      diagnostics: [`Unknown workflow template "${input.templateKey}".`],
      manifest: null,
      templateInput: null,
      graph: null,
      sourceHash: '',
    }
  }
  const parsed = (manifest.inputSchema as z.ZodType<TInput>).safeParse(input.rawInput)
  if (!parsed.success) {
    return {
      ok: false as const,
      diagnostics: parsed.error.issues.map((issue) => `${manifest.key}: invalid input at ${issue.path.join('.') || '<root>'}: ${issue.message}`),
      manifest,
      templateInput: null,
      graph: null,
      sourceHash: '',
    }
  }
  const graph = (manifest as WorkflowTemplateRegistryEntry<TInput, TGraph>).buildGraph(parsed.data)
  const rawValidation = input.validateGraph(graph)
  const validation = {
    ok: rawValidation.ok,
    diagnostics: rawValidation.diagnostics.map((diagnostic) => `${manifest.key}: ${diagnostic}`),
  }
  return {
    ok: validation.ok,
    diagnostics: validation.diagnostics,
    manifest,
    templateInput: parsed.data,
    graph: validation.ok ? graph : null,
    sourceHash: manifest.sourceHash(parsed.data),
  }
}
