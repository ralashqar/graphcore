import { z } from 'zod'

import type { WorkflowTemplateManifest } from './outputWorkflowManifests.ts'

export type WorkflowTemplateGraphRows = {
  nodes: Array<{ key: string; config?: unknown } & Record<string, unknown>>
  edges: Array<Record<string, unknown>>
}

export type WorkflowTemplateRegistryEntry<TInput = unknown, TGraph extends WorkflowTemplateGraphRows = WorkflowTemplateGraphRows> =
  WorkflowTemplateManifest<TInput, TGraph>
export type AnyWorkflowTemplateRegistryEntry = WorkflowTemplateRegistryEntry<any, any>

export type WorkflowTemplateExtensionScaffoldInput<TInput = unknown, TGraph extends WorkflowTemplateGraphRows = WorkflowTemplateGraphRows> = {
  key: string
  label: string
  description?: string
  inputSchema: z.ZodType<TInput>
  policyVersion: string
  buildGraph: (input: TInput) => TGraph
  sourceHash?: (input: TInput) => string
  sourceHashKeys: string[]
  workflowFamily?: string
  commandAction?: string
  graphStages?: string[]
  requiredNodePurposes?: string[]
  requiredArtifactRoles?: string[]
  projectionMetadataKeys?: string[]
  compatibilityWrappers?: string[]
}

export type WorkflowTemplateExtensionScaffold<TInput = unknown, TGraph extends WorkflowTemplateGraphRows = WorkflowTemplateGraphRows> = {
  manifest: WorkflowTemplateRegistryEntry<TInput, TGraph>
  workflowFamily: string
  commandAction: string
  sourceHashKeys: string[]
  graphStages: string[]
  requiredNodePurposes: string[]
  requiredArtifactRoles: string[]
  projectionMetadataKeys: string[]
  compatibilityWrappers: string[]
  requiredTests: string[]
  checklist: string[]
}

export type WorkflowTemplateExtensionScaffoldGraphValidationOptions = {
  artifactRolesForPurpose?: (purpose: string) => readonly string[] | null | undefined
}

function formatTemplateKey(manifest: Partial<AnyWorkflowTemplateRegistryEntry> | null | undefined) {
  const key = typeof manifest?.key === 'string' ? manifest.key.trim() : ''
  return key || '<unknown>'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry ?? '').trim()).filter(Boolean) : []
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function readPath(value: unknown, path: string): unknown {
  if (path === '<root>') return value
  const segments = path.split('.').map((segment) => segment.trim()).filter(Boolean)
  let current = value
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null
    current = (current as Record<string, unknown>)[segment]
  }
  return current ?? null
}

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

export function validateWorkflowTemplateManifestDefinition(manifest: Partial<AnyWorkflowTemplateRegistryEntry> | null | undefined) {
  const diagnostics: string[] = []
  const key = formatTemplateKey(manifest)
  if (!manifest || typeof manifest !== 'object') {
    diagnostics.push('Workflow template manifest is required.')
    return { ok: false as const, diagnostics }
  }
  if (!String(manifest.key ?? '').trim()) diagnostics.push('Workflow template manifest key is required.')
  if (!String(manifest.label ?? '').trim()) diagnostics.push(`${key}: workflow template manifest label is required.`)
  if (!String(manifest.policyVersion ?? '').trim()) diagnostics.push(`${key}: workflow template manifest policyVersion is required.`)
  if (!(manifest.inputSchema instanceof z.ZodType)) diagnostics.push(`${key}: workflow template manifest inputSchema must be a zod schema.`)
  if (typeof manifest.buildGraph !== 'function') diagnostics.push(`${key}: workflow template manifest buildGraph must be a function.`)
  if (typeof manifest.sourceHash !== 'function') diagnostics.push(`${key}: workflow template manifest sourceHash must be a function.`)
  return diagnostics.length === 0
    ? { ok: true as const, diagnostics: [] }
    : { ok: false as const, diagnostics }
}

export function assertWorkflowTemplateManifestDefinition(manifest: Partial<AnyWorkflowTemplateRegistryEntry> | null | undefined) {
  const validation = validateWorkflowTemplateManifestDefinition(manifest)
  if (!validation.ok) throw new Error(validation.diagnostics.join('\n'))
  return manifest as AnyWorkflowTemplateRegistryEntry
}

export function createWorkflowTemplateExtensionScaffold<TInput, TGraph extends WorkflowTemplateGraphRows>(
  input: WorkflowTemplateExtensionScaffoldInput<TInput, TGraph>,
): WorkflowTemplateExtensionScaffold<TInput, TGraph> {
  const sourceHashKeys = Array.from(new Set(input.sourceHashKeys.map((key) => key.trim()).filter(Boolean)))
  if (sourceHashKeys.length === 0 && !input.sourceHash) {
    throw new Error(`${input.key || '<unknown>'}: workflow template scaffold requires sourceHashKeys or a custom sourceHash.`)
  }
  const graphStages = Array.from(new Set((input.graphStages ?? []).map((stage) => stage.trim()).filter(Boolean)))
  const requiredNodePurposes = Array.from(new Set((input.requiredNodePurposes ?? []).map((purpose) => purpose.trim()).filter(Boolean)))
  const requiredArtifactRoles = Array.from(new Set((input.requiredArtifactRoles ?? []).map((role) => role.trim()).filter(Boolean)))
  const projectionMetadataKeys = Array.from(new Set((input.projectionMetadataKeys ?? []).map((key) => key.trim()).filter(Boolean)))
  const compatibilityWrappers = Array.from(new Set((input.compatibilityWrappers ?? []).map((wrapper) => wrapper.trim()).filter(Boolean)))
  const workflowFamily = input.workflowFamily?.trim() || 'output'
  const commandAction = input.commandAction?.trim() || input.key
  const policyVersion = input.policyVersion.trim()
  const manifest: WorkflowTemplateRegistryEntry<TInput, TGraph> = assertWorkflowTemplateManifestDefinition({
    key: input.key,
    label: input.label,
    description: input.description,
    inputSchema: input.inputSchema,
    policyVersion,
    buildGraph: input.buildGraph,
    sourceHash: input.sourceHash ?? ((templateInput: TInput) => workflowTemplateSourceHash({
      policyVersion,
      sourceHashKeys: Object.fromEntries(sourceHashKeys.map((key) => [key, readPath(templateInput, key)])),
    })),
  }) as WorkflowTemplateRegistryEntry<TInput, TGraph>
  return {
    manifest,
    workflowFamily,
    commandAction,
    sourceHashKeys,
    graphStages,
    requiredNodePurposes,
    requiredArtifactRoles,
    projectionMetadataKeys,
    compatibilityWrappers,
    requiredTests: [
      `template:${manifest.key}:registered`,
      `template:${manifest.key}:validated_graph`,
      `template:${manifest.key}:source_hash_stability`,
      `template:${manifest.key}:command_route:${workflowFamily}:${commandAction}`,
      `template:${manifest.key}:projection_metadata`,
    ],
    checklist: [
      'Register the template manifest in a server-owned WorkflowTemplateRegistry; clients should send typed commands, not graph rows.',
      'Route the command through start-workflow-command or a compatibility wrapper that delegates to the generic command handler.',
      'Include scope, force flags, user overrides, reference asset keys, policy versions, and selected node/shot ids in sourceHashKeys.',
      'Validate graph rows with validateOutputWorkflowGraph(normalizeWorkflowTemplateGraphRows(graph)) before persistence.',
      'Expose projection metadata for active node, active child requests/runs, provider or streaming status, ready artifacts, failures, and recovery hints.',
      'Document removal criteria for compatibility wrappers before adding new endpoint-specific orchestration.',
    ],
  }
}

export function validateWorkflowTemplateExtensionScaffoldGraph<TInput, TGraph extends WorkflowTemplateGraphRows>(
  scaffold: WorkflowTemplateExtensionScaffold<TInput, TGraph>,
  graph: TGraph,
  options: WorkflowTemplateExtensionScaffoldGraphValidationOptions = {},
) {
  const diagnostics: string[] = []
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const stageKeys = new Set<string>()
  const purposeKeys = new Set<string>()
  const artifactRoles = new Set<string>()
  for (const node of nodes) {
    const key = String(node.key ?? '').trim()
    if (key) stageKeys.add(key)
    const config = asRecord(node.config)
    const stage = String(config.stage ?? '').trim()
    if (stage) stageKeys.add(stage)
    const purpose = String(config.purpose ?? '').trim()
    if (purpose) {
      purposeKeys.add(purpose)
      for (const role of options.artifactRolesForPurpose?.(purpose) ?? []) {
        const normalized = String(role ?? '').trim()
        if (normalized) artifactRoles.add(normalized)
      }
    }
    for (const role of [
      ...readStringArray(config.requiredArtifactRoles),
      ...readStringArray(config.required_artifact_roles),
      ...readStringArray(config.artifactRoles),
      ...readStringArray(config.artifact_roles),
    ]) {
      artifactRoles.add(role)
    }
  }
  for (const stage of scaffold.graphStages) {
    if (!stageKeys.has(stage)) diagnostics.push(`${scaffold.manifest.key}: scaffold graph stage "${stage}" is not represented by a node key or node config.stage.`)
  }
  for (const purpose of scaffold.requiredNodePurposes) {
    if (!purposeKeys.has(purpose)) diagnostics.push(`${scaffold.manifest.key}: scaffold required node purpose "${purpose}" is not present in graph nodes.`)
  }
  for (const role of scaffold.requiredArtifactRoles) {
    if (!artifactRoles.has(role)) diagnostics.push(`${scaffold.manifest.key}: scaffold required artifact role "${role}" is not present in graph config or node manifest roles.`)
  }
  return diagnostics.length === 0
    ? { ok: true as const, diagnostics: [] }
    : { ok: false as const, diagnostics }
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
  assertWorkflowTemplateManifestDefinition(manifest)
  const key = manifest.key.trim()
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
  let graph: TGraph
  try {
    graph = (manifest as WorkflowTemplateRegistryEntry<TInput, TGraph>).buildGraph(parsed.data)
  } catch (error) {
    return {
      ok: false as const,
      diagnostics: [`${manifest.key}: buildGraph failed: ${messageFromError(error)}`],
      manifest,
      templateInput: parsed.data,
      graph: null,
      sourceHash: '',
    }
  }
  if (!graph || typeof graph !== 'object' || !Array.isArray((graph as WorkflowTemplateGraphRows).nodes) || !Array.isArray((graph as WorkflowTemplateGraphRows).edges)) {
    return {
      ok: false as const,
      diagnostics: [`${manifest.key}: template buildGraph must return graph rows with nodes and edges arrays.`],
      manifest,
      templateInput: parsed.data,
      graph: null,
      sourceHash: '',
    }
  }
  if ((graph as WorkflowTemplateGraphRows).nodes.length === 0) {
    return {
      ok: false as const,
      diagnostics: [`${manifest.key}: template buildGraph returned no nodes.`],
      manifest,
      templateInput: parsed.data,
      graph: null,
      sourceHash: '',
    }
  }
  let sourceHash = ''
  try {
    sourceHash = String(manifest.sourceHash(parsed.data) ?? '').trim()
  } catch (error) {
    return {
      ok: false as const,
      diagnostics: [`${manifest.key}: sourceHash failed: ${messageFromError(error)}`],
      manifest,
      templateInput: parsed.data,
      graph: null,
      sourceHash: '',
    }
  }
  if (!sourceHash) {
    return {
      ok: false as const,
      diagnostics: [`${manifest.key}: template sourceHash must return a non-empty string.`],
      manifest,
      templateInput: parsed.data,
      graph: null,
      sourceHash: '',
    }
  }
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
    sourceHash,
  }
}
