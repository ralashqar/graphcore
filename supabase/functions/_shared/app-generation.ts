import { z } from 'npm:zod@4'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const appGenerationStatusSchema = z.enum(['queued', 'running', 'completed', 'completed_with_errors', 'failed', 'cancelled'])
export const appGenerationKindSchema = z.enum(['code_generation', 'preview_build'])
export const appPreviewGateSchema = z.enum([
  'design_graph_draft',
  'design_graph_refined',
  'visual_prototype_ready',
  'implementation_plan_ready',
  'code_generated',
  'preview_passing',
])
export const appGeneratedFileKindSchema = z.enum(['config', 'route', 'screen', 'component', 'hook', 'adapter', 'model', 'test', 'asset', 'docs', 'style'])

export const appGeneratedFileSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  jobId: z.string(),
  path: z.string(),
  kind: appGeneratedFileKindSchema,
  ownerTower: z.string().default(''),
  content: z.string().default(''),
  contentHash: z.string().default(''),
  exports: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const appGenerationJobStepSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  status: appGenerationStatusSchema,
  stepKey: z.string(),
  label: z.string(),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const appGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  requestedBy: z.string().nullable().default(null),
  status: appGenerationStatusSchema,
  kind: appGenerationKindSchema,
  targetGate: appPreviewGateSchema.default('code_generated'),
  input: looseRecordSchema.default({}),
  outputs: looseRecordSchema.default({}),
  errorMessage: z.string().nullable().default(null),
  workerId: z.string().nullable().default(null),
  heartbeatAt: z.string().nullable().default(null),
  attemptCount: z.number().int().nonnegative().default(0),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  steps: z.array(appGenerationJobStepSchema).default([]),
  files: z.array(appGeneratedFileSchema).default([]),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const appGenerationStartRequestSchema = z.object({
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  kind: appGenerationKindSchema.default('code_generation'),
  targetGate: appPreviewGateSchema.default('code_generated'),
  input: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
})

export const appGenerationStatusResponseSchema = z.object({
  ok: z.literal(true),
  job: appGenerationJobSchema,
  terminal: z.boolean(),
})

export const appGenerationCancelResponseSchema = z.object({
  ok: z.literal(true),
  job: appGenerationJobSchema,
})

export const appPreviewSessionResponseSchema = z.object({
  ok: z.literal(true),
  jobId: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  status: appGenerationStatusSchema,
  previewUrl: z.string().default(''),
  previewHtml: z.string().default(''),
  files: z.array(appGeneratedFileSchema).default([]),
})

export const appGenerationJobSelect = 'id, project_id, draft_id, requested_by, status, kind, target_gate, input, outputs, error_message, worker_id, heartbeat_at, attempt_count, started_at, completed_at, metadata, created_at, updated_at'
export const appGenerationStepSelect = 'id, job_id, status, step_key, label, started_at, completed_at, error_message, metadata, created_at, updated_at'
export const appGeneratedFileSelect = 'id, project_id, draft_id, job_id, path, kind, owner_tower, content, content_hash, exports, imports, metadata, created_at, updated_at'

export type AppGenerationJob = z.infer<typeof appGenerationJobSchema>
export type AppGeneratedFileDraft = {
  path: string
  kind: z.infer<typeof appGeneratedFileKindSchema>
  ownerTower: string
  content: string
  exports: string[]
  imports: string[]
  metadata: Record<string, unknown>
}

export type AppGenerationJobRow = {
  id: string
  project_id: string
  draft_id: string
  requested_by: string | null
  status: string
  kind: string
  target_gate: string
  input: Record<string, unknown> | null
  outputs: Record<string, unknown> | null
  error_message: string | null
  worker_id: string | null
  heartbeat_at: string | null
  attempt_count: number | null
  started_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type AppGenerationStepRow = {
  id: string
  job_id: string
  status: string
  step_key: string
  label: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type AppGeneratedFileRow = {
  id: string
  project_id: string
  draft_id: string
  job_id: string
  path: string
  kind: string
  owner_tower: string | null
  content: string | null
  content_hash: string | null
  exports: string[] | null
  imports: string[] | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type WorldEntityRow = {
  id: string
  key: string
  name: string
  summary: string | null
  context: string | null
  node_type: string
  aliases: string[] | null
  tags: string[] | null
  status: string | null
  thumbnail_asset_key: string | null
  linked_definition_key: string | null
  source: string | null
  custom_properties: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export type AppEntity = {
  id: string
  key: string
  name: string
  summary: string
  context: string
  nodeType: string
  customProperties: Record<string, unknown>
  metadata: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function textFrom(entity: AppEntity, key: string): string {
  const app = asRecord(asRecord(entity.customProperties).app)
  const value = app[key] ?? entity.customProperties[key]
  return typeof value === 'string' ? value.trim() : ''
}

function appProps(entity: AppEntity): Record<string, unknown> {
  return asRecord(asRecord(entity.customProperties).app)
}

function interactiveProps(entity: AppEntity): Record<string, unknown> {
  return {
    ...asRecord(asRecord(entity.customProperties).interactive),
    ...asRecord(asRecord(entity.customProperties).game),
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

const INTERACTIVE_NODE_TYPES = new Set([
  'player_profile',
  'player_initial_config',
  'player_stat',
  'inventory',
  'inventory_item',
  'currency',
  'shadow_token',
  'location_spot',
  'travel_link',
  'marketplace',
  'trade_offer',
  'quest',
  'quest_step',
  'narrative_arc',
  'narrative_scene',
  'dialogue_node',
  'choice',
  'choice_condition',
  'choice_outcome',
  'state_variable',
  'game_rule',
  'encounter',
  'save_state',
])

function hasInteractiveSystems(entities: AppEntity[]) {
  return entities.some((entity) => {
    if (INTERACTIVE_NODE_TYPES.has(entity.nodeType)) return true
    const app = appProps(entity)
    const interactive = interactiveProps(entity)
    return stringArray(app.interactiveSystems).length > 0
      || stringArray(app.requiredInteractiveSystems).length > 0
      || stringArray(interactive.requiredSystems).length > 0
  })
}

function generatedInteractiveRuntimeSource() {
  return "export type InteractiveRuntimeState = { inventoryKeys: string[]; currency: Record<string, number>; tokenKeys: string[]; stats: Record<string, number>; state: Record<string, unknown>; currentLocationKey: string | null; currentSpotKey: string | null; currentSceneKey: string | null; currentDialogueKey: string | null; visitedLocationKeys: string[] }\nexport type InteractiveCondition = { kind: 'has_item' | 'has_token' | 'has_currency' | 'state_equals' | 'visited_location' | 'stat_eq' | 'stat_gte' | 'stat_lte' | 'stat_gt' | 'stat_lt'; targetKey: string; operator?: 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt' | 'exists' | 'missing'; value?: string | number | boolean; quantity?: number }\nexport type InteractiveOutcome = { kind: 'grant_item' | 'remove_item' | 'grant_token' | 'remove_token' | 'remove_currency' | 'grant_currency' | 'set_state' | 'clear_state' | 'set_stat' | 'increase_stat' | 'decrease_stat' | 'clamp_stat' | 'unlock' | 'travel_to' | 'branch_to' | 'set_current_dialogue' | 'set_current_scene'; targetKey: string; value?: string | number | boolean; quantity?: number }\nfunction compare(left: unknown, operator: InteractiveCondition['operator'] = 'exists', right: unknown) { if (operator === 'exists') return left !== undefined && left !== null && left !== false; if (operator === 'missing') return left === undefined || left === null || left === false; if (operator === 'eq') return left === right; if (operator === 'neq') return left !== right; if (typeof left !== 'number' || typeof right !== 'number') return false; if (operator === 'gte') return left >= right; if (operator === 'lte') return left <= right; if (operator === 'gt') return left > right; if (operator === 'lt') return left < right; return false }\nexport function createInitialRuntimeState(manifest: { initialState: InteractiveRuntimeState }) { return { ...manifest.initialState, inventoryKeys: [...manifest.initialState.inventoryKeys], tokenKeys: [...manifest.initialState.tokenKeys], currency: { ...manifest.initialState.currency }, stats: { ...manifest.initialState.stats }, state: { ...manifest.initialState.state }, visitedLocationKeys: [...manifest.initialState.visitedLocationKeys] } }\nexport function evaluateCondition(condition: InteractiveCondition, state: InteractiveRuntimeState) { const quantity = condition.quantity ?? 1; if (condition.kind === 'has_item') return compare(state.inventoryKeys.filter((key) => key === condition.targetKey).length, condition.operator === 'exists' ? 'gte' : condition.operator, condition.value ?? quantity); if (condition.kind === 'has_token') return compare(state.tokenKeys.includes(condition.targetKey), condition.operator, condition.value ?? true); if (condition.kind === 'has_currency') return compare(state.currency[condition.targetKey] ?? 0, condition.operator === 'exists' ? 'gte' : condition.operator, condition.value ?? quantity); if (condition.kind === 'state_equals') return compare(state.state[condition.targetKey], condition.operator, condition.value); if (condition.kind === 'visited_location') return compare(state.visitedLocationKeys.includes(condition.targetKey), condition.operator, condition.value ?? true); if (condition.kind === 'stat_eq') return compare(state.stats[condition.targetKey] ?? 0, 'eq', condition.value ?? quantity); if (condition.kind === 'stat_gte') return compare(state.stats[condition.targetKey] ?? 0, 'gte', condition.value ?? quantity); if (condition.kind === 'stat_lte') return compare(state.stats[condition.targetKey] ?? 0, 'lte', condition.value ?? quantity); if (condition.kind === 'stat_gt') return compare(state.stats[condition.targetKey] ?? 0, 'gt', condition.value ?? quantity); if (condition.kind === 'stat_lt') return compare(state.stats[condition.targetKey] ?? 0, 'lt', condition.value ?? quantity); return false }\nexport function applyOutcome(outcome: InteractiveOutcome, state: InteractiveRuntimeState): InteractiveRuntimeState { const quantity = outcome.quantity ?? 1; const next: InteractiveRuntimeState = { ...state, inventoryKeys: [...state.inventoryKeys], tokenKeys: [...state.tokenKeys], currency: { ...state.currency }, stats: { ...state.stats }, state: { ...state.state }, visitedLocationKeys: [...state.visitedLocationKeys] }; if (outcome.kind === 'grant_item') next.inventoryKeys.push(...Array.from({ length: quantity }, () => outcome.targetKey)); if (outcome.kind === 'remove_item') { let remaining = quantity; next.inventoryKeys = next.inventoryKeys.filter((key) => key !== outcome.targetKey || remaining-- <= 0) } if (outcome.kind === 'grant_token' || outcome.kind === 'unlock') { if (!next.tokenKeys.includes(outcome.targetKey)) next.tokenKeys.push(outcome.targetKey) } if (outcome.kind === 'remove_token') next.tokenKeys = next.tokenKeys.filter((key) => key !== outcome.targetKey); if (outcome.kind === 'grant_currency') next.currency[outcome.targetKey] = (next.currency[outcome.targetKey] ?? 0) + quantity; if (outcome.kind === 'remove_currency') next.currency[outcome.targetKey] = Math.max(0, (next.currency[outcome.targetKey] ?? 0) - quantity); if (outcome.kind === 'set_state') next.state[outcome.targetKey] = outcome.value ?? true; if (outcome.kind === 'clear_state') delete next.state[outcome.targetKey]; if (outcome.kind === 'set_stat') next.stats[outcome.targetKey] = typeof outcome.value === 'number' ? outcome.value : quantity; if (outcome.kind === 'increase_stat') next.stats[outcome.targetKey] = (next.stats[outcome.targetKey] ?? 0) + quantity; if (outcome.kind === 'decrease_stat') next.stats[outcome.targetKey] = (next.stats[outcome.targetKey] ?? 0) - quantity; if (outcome.kind === 'travel_to') { next.currentLocationKey = outcome.targetKey; if (!next.visitedLocationKeys.includes(outcome.targetKey)) next.visitedLocationKeys.push(outcome.targetKey) } if (outcome.kind === 'branch_to') next.state.currentBranchKey = outcome.targetKey; if (outcome.kind === 'set_current_dialogue') next.currentDialogueKey = outcome.targetKey; if (outcome.kind === 'set_current_scene') next.currentSceneKey = outcome.targetKey; return next }\n"
}

function generatedInteractiveAdapterSource() {
  return "import { applyOutcome, evaluateCondition, type InteractiveCondition, type InteractiveOutcome, type InteractiveRuntimeState } from './InteractiveRuntime'\n\nexport type InteractiveRuntimeAdapter = { getState(): Promise<InteractiveRuntimeState>; setState(state: InteractiveRuntimeState): Promise<void>; evaluate(condition: InteractiveCondition): Promise<boolean>; apply(outcome: InteractiveOutcome): Promise<InteractiveRuntimeState> }\nexport function createMockInteractiveAdapter(initialState?: Partial<InteractiveRuntimeState>): InteractiveRuntimeAdapter { let state: InteractiveRuntimeState = { inventoryKeys: [], currency: {}, tokenKeys: [], stats: {}, state: {}, currentLocationKey: null, currentSpotKey: null, currentSceneKey: null, currentDialogueKey: null, visitedLocationKeys: [], ...initialState }; return { async getState() { return state }, async setState(nextState) { state = nextState }, async evaluate(condition) { return evaluateCondition(condition, state) }, async apply(outcome) { state = applyOutcome(outcome, state); return state } } }\n"
}

function generatedInteractiveManifestSource(entities: AppEntity[]) {
  const interactiveNodes = entities.filter((entity) => INTERACTIVE_NODE_TYPES.has(entity.nodeType))
  const initialConfig = interactiveNodes.find((entity) => entity.nodeType === 'player_initial_config')
  const initialProps = initialConfig ? interactiveProps(initialConfig) : {}
  const stats = interactiveNodes
    .filter((entity) => entity.nodeType === 'player_stat')
    .map((entity) => {
      const props = interactiveProps(entity)
      return {
        key: entity.key,
        name: entity.name,
        summary: entity.summary,
        displayLabel: typeof props.displayLabel === 'string' ? props.displayLabel : entity.name,
        defaultValue: typeof props.defaultValue === 'number' ? props.defaultValue : 0,
        min: typeof props.min === 'number' ? props.min : undefined,
        max: typeof props.max === 'number' ? props.max : undefined,
      }
    })
  const initialStats = asRecord(initialProps.stats)
  const manifest = {
    initialState: {
      inventoryKeys: [...stringArray(initialProps.inventoryKeys), ...stringArray(initialProps.initialItemKeys)],
      currency: asRecord(initialProps.currency),
      tokenKeys: stringArray(initialProps.tokenKeys),
      stats: Object.fromEntries([
        ...stats.map((stat) => [stat.key, stat.defaultValue] as const),
        ...Object.entries(initialStats).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
      ]),
      state: asRecord(initialProps.state),
      currentLocationKey: typeof (initialProps.currentLocationKey ?? initialProps.startLocationKey) === 'string' ? initialProps.currentLocationKey ?? initialProps.startLocationKey : null,
      currentSpotKey: typeof (initialProps.currentSpotKey ?? initialProps.startSpotKey) === 'string' ? initialProps.currentSpotKey ?? initialProps.startSpotKey : null,
      currentSceneKey: typeof (initialProps.currentSceneKey ?? initialProps.startSceneKey) === 'string' ? initialProps.currentSceneKey ?? initialProps.startSceneKey : null,
      currentDialogueKey: typeof (initialProps.currentDialogueKey ?? initialProps.startDialogueKey) === 'string' ? initialProps.currentDialogueKey ?? initialProps.startDialogueKey : null,
      visitedLocationKeys: stringArray(initialProps.visitedLocationKeys),
    },
    stats,
    graphNodes: interactiveNodes.map((entity) => ({
      key: entity.key,
      name: entity.name,
      summary: entity.summary,
      nodeType: entity.nodeType,
      interactive: interactiveProps(entity),
    })),
  }
  return `export const interactiveManifest = ${JSON.stringify(manifest, null, 2)} as const\n`
}

function routeSafe(entity: AppEntity): string {
  return (textFrom(entity, 'route') || entity.name || entity.key)
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || entity.key
}

function pascalCase(value: string): string {
  const result = value
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join('')
  return result || 'Generated'
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function cssColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim()) ? value.trim() : fallback
}

function colorSchemeFromMetadata(metadata: Record<string, unknown>) {
  return asRecord(asRecord(metadata.worldWiki).colorScheme)
}

function inferFileKind(path: string): AppGeneratedFileDraft['kind'] {
  if (path.endsWith('.json')) return 'config'
  if (path.endsWith('.md')) return 'docs'
  if (path.startsWith('app/')) return 'route'
  if (path.includes('/components/') || path.startsWith('components/')) return 'component'
  if (path.includes('/backend/') || path.includes('/capabilities/')) return 'adapter'
  if (path.includes('/types/')) return 'model'
  if (path.includes('/design/')) return 'style'
  return 'screen'
}

function routeFileForScreen(screen: AppEntity) {
  const route = routeSafe(screen)
  return route === 'home' || route === 'index' ? 'app/index.tsx' : `app/${route}.tsx`
}

function reactNativeScreen(screen: AppEntity, colors: Record<string, unknown>): string {
  const primary = cssColor(colors.primary, '#2563eb')
  const tertiary = cssColor(colors.tertiary, '#f8fafc')
  const componentName = `${pascalCase(routeSafe(screen))}Screen`
  return `import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

export default function ${componentName}() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>${screen.nodeType.replace(/_/g, ' ')}</Text>
      <Text style={styles.title}>${screen.name.replace(/`/g, "'")}</Text>
      <Text style={styles.summary}>${(screen.summary || screen.context || textFrom(screen, 'purpose') || 'Generated app screen.').replace(/`/g, "'")}</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Purpose</Text>
        <Text style={styles.cardText}>${(textFrom(screen, 'purpose') || 'Ready for graph refinement.').replace(/`/g, "'")}</Text>
      </View>
      <Pressable style={styles.cta}><Text style={styles.ctaText}>Continue</Text></Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { minHeight: '100%', padding: 24, gap: 18, backgroundColor: '${tertiary}' },
  eyebrow: { marginTop: 44, color: '${primary}', fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: '#0f172a', fontSize: 34, fontWeight: '800' },
  summary: { color: '#475569', fontSize: 16, lineHeight: 23 },
  card: { padding: 20, borderRadius: 24, backgroundColor: '#fff' },
  cardTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  cardText: { marginTop: 8, color: '#475569', fontSize: 15, lineHeight: 22 },
  cta: { alignItems: 'center', borderRadius: 999, paddingVertical: 16, backgroundColor: '${primary}' },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
})
`
}

export function mapWorldEntityRow(row: WorldEntityRow): AppEntity {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    summary: row.summary ?? '',
    context: row.context ?? '',
    nodeType: row.node_type,
    customProperties: row.custom_properties ?? {},
    metadata: row.metadata ?? {},
  }
}

function mapStepRow(row: AppGenerationStepRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    stepKey: row.step_key,
    label: row.label,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapFileRow(row: AppGeneratedFileRow) {
  return appGeneratedFileSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    jobId: row.job_id,
    path: row.path,
    kind: row.kind,
    ownerTower: row.owner_tower ?? '',
    content: row.content ?? '',
    contentHash: row.content_hash ?? '',
    exports: row.exports ?? [],
    imports: row.imports ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function mapAppGenerationJobRow(
  row: AppGenerationJobRow,
  steps: AppGenerationStepRow[] = [],
  files: AppGeneratedFileRow[] = [],
): AppGenerationJob {
  return appGenerationJobSchema.parse({
    id: row.id,
    projectId: row.project_id,
    draftId: row.draft_id,
    requestedBy: row.requested_by,
    status: row.status,
    kind: row.kind,
    targetGate: row.target_gate,
    input: row.input ?? {},
    outputs: row.outputs ?? {},
    errorMessage: row.error_message,
    workerId: row.worker_id,
    heartbeatAt: row.heartbeat_at,
    attemptCount: row.attempt_count ?? 0,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    metadata: row.metadata ?? {},
    steps: steps.map(mapStepRow),
    files: files.map(mapFileRow),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })
}

export function appGenerationJobIsDone(job: Pick<AppGenerationJob, 'status'>) {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)
}

export function evaluateAppPreviewReadiness(input: { draftMetadata: Record<string, unknown>; entities: AppEntity[] }) {
  const counts = input.entities.reduce<Record<string, number>>((acc, entity) => {
    acc[entity.nodeType] = (acc[entity.nodeType] ?? 0) + 1
    return acc
  }, {})
  const worldWiki = asRecord(input.draftMetadata.worldWiki)
  const appNode = input.entities.find((entity) => entity.nodeType === 'app')
  const appNodeProps = appNode ? appProps(appNode) : {}
  const designApproval = asRecord(appNodeProps.designApproval ?? appNode?.metadata?.designApproval)
  const designApproved = designApproval.status === 'approved'
  const hasDesignMetadata = Boolean(worldWiki.artStyleDescription && worldWiki.brandAtlasPrompt && Object.keys(asRecord(worldWiki.colorScheme)).length > 0)
  const designGraphDraft = Boolean(counts.app && counts.user_flow && counts.screen)
  const designGraphRefined = designGraphDraft && Boolean(counts.component && counts.data_model && counts.action && counts.api_endpoint && counts.capability && counts.design_system && hasDesignMetadata)
  const visualPrototypeReady = designGraphRefined && Boolean(worldWiki.brandAtlasAssetKey && counts.screen_mockup)
  const implementationPlanReady = visualPrototypeReady && designApproved && Boolean(counts.tower && counts.code_file)
  return {
    currentGate: implementationPlanReady
      ? 'implementation_plan_ready'
      : visualPrototypeReady
        ? 'visual_prototype_ready'
        : designGraphRefined
          ? 'design_graph_refined'
          : designGraphDraft
            ? 'design_graph_draft'
            : 'design_graph_draft',
    gates: {
      design_graph_draft: designGraphDraft,
      design_graph_refined: designGraphRefined,
      visual_prototype_ready: visualPrototypeReady,
      implementation_plan_ready: implementationPlanReady,
      code_generated: false,
      preview_passing: false,
    },
    designApproved,
    counts,
  }
}

export function buildAppSandboxPreviewHtml(input: { projectName: string; draftMetadata: Record<string, unknown>; entities: AppEntity[] }) {
  const app = input.entities.find((entity) => entity.nodeType === 'app')
  const screens = input.entities.filter((entity) => entity.nodeType === 'screen')
  const colors = colorSchemeFromMetadata(input.draftMetadata)
  const primary = cssColor(colors.primary, '#2563eb')
  const secondary = cssColor(colors.secondary, '#14b8a6')
  const tertiary = cssColor(colors.tertiary, '#f8fafc')
  const title = app?.name || input.projectName || 'Generated App'
  const summary = app?.summary || 'Graph-generated app preview.'
  const activeScreens = screens.length > 0 ? screens : [{ key: 'home', name: 'Home Screen', summary: 'Start the app flow.', context: '', nodeType: 'screen', id: 'home', customProperties: { app: { route: '/' } }, metadata: {} }]
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#08111f;font-family:Inter,system-ui,sans-serif}.phone{width:390px;max-width:100vw;height:844px;max-height:100vh;border:10px solid #111827;border-radius:46px;overflow:hidden;background:${tertiary};box-shadow:0 30px 90px #0008}.app{height:100%;display:grid;grid-template-rows:auto 1fr auto;background:linear-gradient(180deg,${tertiary},#fff)}header{padding:58px 24px 18px}.eyebrow{color:${secondary};font-size:11px;font-weight:800;text-transform:uppercase}h1,h2,p{margin:0}h1{margin-top:8px;color:#0f172a;font-size:32px;line-height:1.02}header p{margin-top:10px;color:#64748b;font-size:14px;line-height:1.45}main{min-height:0;overflow:hidden;padding:0 18px 18px}.screen{display:none;height:100%;overflow:auto;padding:18px;border-radius:28px;background:#fffffff2;box-shadow:0 18px 50px #0f172a1a}.screen.active{display:block}.route{color:#64748b;font-size:12px;font-weight:800}.screen h2{margin-top:26px;color:#0f172a;font-size:28px}.screen p{margin-top:10px;color:#475569;font-size:15px;line-height:1.45}.card{margin-top:22px;padding:18px;border-radius:22px;background:color-mix(in srgb,${primary} 9%,white)}button{border:0}.cta{width:100%;margin-top:22px;border-radius:999px;padding:15px 18px;color:#fff;background:${primary};font-weight:850}.tabs{display:flex;gap:8px;overflow:auto;padding:12px 16px 22px;background:#ffffffc7}.tab{border-radius:999px;padding:10px 12px;background:#eef2f7;color:#334155;font-size:12px;font-weight:800}.tab.active{background:${primary};color:#fff}
</style></head><body><div class="phone"><div class="app"><header><span class="eyebrow">Sandbox preview</span><h1>${escapeHtml(title)}</h1><p>${escapeHtml(summary)}</p></header><main>${activeScreens.map((screen, index) => `<section class="screen${index === 0 ? ' active' : ''}" data-screen="${escapeHtml(screen.key)}"><span class="route">${escapeHtml(textFrom(screen, 'route') || `/${routeSafe(screen)}`)}</span><h2>${escapeHtml(screen.name)}</h2><p>${escapeHtml(screen.summary || screen.context || 'Generated app screen.')}</p><div class="card"><strong>Purpose</strong><p>${escapeHtml(textFrom(screen, 'purpose') || 'Ready for refinement.')}</p></div><button class="cta">Continue</button></section>`).join('')}</main><nav class="tabs">${activeScreens.map((screen, index) => `<button class="tab${index === 0 ? ' active' : ''}" data-screen="${escapeHtml(screen.key)}">${escapeHtml(screen.name)}</button>`).join('')}</nav></div></div><script>const tabs=[...document.querySelectorAll('.tab')],screens=[...document.querySelectorAll('.screen')];tabs.forEach(t=>t.onclick=()=>{const k=t.dataset.screen;tabs.forEach(x=>x.classList.toggle('active',x===t));screens.forEach(x=>x.classList.toggle('active',x.dataset.screen===k));});</script></body></html>`
}

export function buildAppGeneratedFileDrafts(input: { projectName: string; draftMetadata: Record<string, unknown>; entities: AppEntity[] }): AppGeneratedFileDraft[] {
  const colors = colorSchemeFromMetadata(input.draftMetadata)
  const app = input.entities.find((entity) => entity.nodeType === 'app')
  const screens = input.entities.filter((entity) => entity.nodeType === 'screen')
  const components = input.entities.filter((entity) => entity.nodeType === 'component')
  const appName = app?.name || input.projectName || 'Generated App'
  const files: AppGeneratedFileDraft[] = [
    { path: 'package.json', kind: 'config', ownerTower: 'project_setup', content: `${JSON.stringify({ scripts: { start: 'expo start', web: 'expo start --web', typecheck: 'tsc --noEmit' }, dependencies: { expo: 'latest', 'expo-router': 'latest', react: 'latest', 'react-native': 'latest', 'react-native-web': 'latest' }, devDependencies: { typescript: 'latest' } }, null, 2)}\n`, exports: [], imports: [], metadata: {} },
    { path: 'app.json', kind: 'config', ownerTower: 'project_setup', content: `${JSON.stringify({ expo: { name: appName, slug: appName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), platforms: ['ios', 'web'] } }, null, 2)}\n`, exports: [], imports: [], metadata: {} },
    { path: 'README.md', kind: 'docs', ownerTower: 'project_setup', content: `# ${appName}\n\nGenerated from GraphCore's App Graph.\n`, exports: [], imports: [], metadata: {} },
    { path: 'app/_layout.tsx', kind: 'route', ownerTower: 'navigation', content: "import { Stack } from 'expo-router'\n\nexport default function RootLayout() {\n  return <Stack screenOptions={{ headerShown: false }} />\n}\n", exports: ['RootLayout'], imports: ['Stack'], metadata: {} },
    { path: 'lib/design/tokens.ts', kind: 'style', ownerTower: 'design_system', content: `export const designTokens = ${JSON.stringify({ color: { primary: cssColor(colors.primary, '#2563eb'), secondary: cssColor(colors.secondary, '#14b8a6'), tertiary: cssColor(colors.tertiary, '#f8fafc') } }, null, 2)} as const\n`, exports: ['designTokens'], imports: [], metadata: {} },
    { path: 'lib/backend/AppBackend.ts', kind: 'adapter', ownerTower: 'backend', content: "export interface AppBackend {\n  getEntities(type: string): Promise<unknown[]>\n  createEntity(type: string, data: unknown): Promise<unknown>\n  runAction(actionId: string, input: unknown): Promise<unknown>\n}\n", exports: ['AppBackend'], imports: [], metadata: {} },
    { path: 'lib/backend/LocalMockBackendAdapter.ts', kind: 'adapter', ownerTower: 'backend', content: "import type { AppBackend } from './AppBackend'\n\nexport class LocalMockBackendAdapter implements AppBackend {\n  async getEntities() { return [] }\n  async createEntity(_type: string, data: unknown) { return { id: crypto.randomUUID(), data } }\n  async runAction(actionId: string, input: unknown) { return { actionId, input, mocked: true } }\n}\n", exports: ['LocalMockBackendAdapter'], imports: ['AppBackend'], metadata: {} },
    { path: 'lib/contracts/routes.ts', kind: 'model', ownerTower: 'shared_contracts', content: `export const routeManifest = ${JSON.stringify(screens.map((screen) => ({ key: screen.key, name: screen.name, route: textFrom(screen, 'route') || `/${routeSafe(screen)}` })), null, 2)} as const\n`, exports: ['routeManifest'], imports: [], metadata: {} },
    { path: 'lib/contracts/actions.ts', kind: 'model', ownerTower: 'shared_contracts', content: `export const actionContracts = ${JSON.stringify(input.entities.filter((entity) => entity.nodeType === 'action').map((action) => ({ key: action.key, name: action.name, input: appProps(action).input ?? {}, output: appProps(action).output ?? {}, sideEffects: appProps(action).sideEffects ?? [] })), null, 2)} as const\n`, exports: ['actionContracts'], imports: [], metadata: {} },
    { path: 'lib/capabilities/CapabilityAdapters.ts', kind: 'adapter', ownerTower: 'capabilities', content: "export type CapabilityResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string }\n\nexport interface CameraAdapter { pickImage(): Promise<CapabilityResult<{ uri: string }>> }\nexport interface HealthAdapter { getDailySteps(): Promise<CapabilityResult<{ steps: number }>> }\nexport interface PushAdapter { requestPermission(): Promise<CapabilityResult<{ granted: boolean }>>; scheduleLocalNotification(input: { title: string; body: string }): Promise<CapabilityResult<{ id: string }>> }\nexport interface CapabilityAdapters { camera: CameraAdapter; health: HealthAdapter; push: PushAdapter }\n", exports: ['CapabilityAdapters'], imports: [], metadata: {} },
    { path: 'lib/capabilities/MockCapabilityAdapters.ts', kind: 'adapter', ownerTower: 'capabilities', content: "import type { CapabilityAdapters } from './CapabilityAdapters'\n\nexport const mockCapabilityAdapters: CapabilityAdapters = {\n  camera: { async pickImage() { return { ok: true, data: { uri: 'mock://image' } } } },\n  health: { async getDailySteps() { return { ok: true, data: { steps: 6420 } } } },\n  push: { async requestPermission() { return { ok: true, data: { granted: true } } }, async scheduleLocalNotification() { return { ok: true, data: { id: 'mock-notification' } } } },\n}\n", exports: ['mockCapabilityAdapters'], imports: ['CapabilityAdapters'], metadata: {} },
    { path: 'lib/payments/PaymentAdapter.ts', kind: 'adapter', ownerTower: 'capabilities', content: "export type SubscriptionState = { active: boolean; plan: 'free' | 'pro' | 'premium' }\nexport interface PaymentAdapter { getSubscriptionState(): Promise<SubscriptionState>; presentPaywall(trigger: string): Promise<SubscriptionState> }\nexport const mockPaymentAdapter: PaymentAdapter = { async getSubscriptionState() { return { active: false, plan: 'free' } }, async presentPaywall() { return { active: true, plan: 'pro' } } }\n", exports: ['PaymentAdapter', 'mockPaymentAdapter'], imports: [], metadata: {} },
    { path: 'lib/ai/AiGenerationAdapter.ts', kind: 'adapter', ownerTower: 'backend', content: "export interface AiGenerationAdapter { generate(input: { actionId: string; prompt: string; data?: unknown }): Promise<{ title: string; summary: string; payload: unknown }> }\nexport const mockAiGenerationAdapter: AiGenerationAdapter = { async generate(input) { return { title: 'Mock result', summary: `Generated preview for ${input.actionId}.`, payload: { mocked: true, input } } } }\n", exports: ['AiGenerationAdapter', 'mockAiGenerationAdapter'], imports: [], metadata: {} },
    { path: 'lib/auth/AuthAdapter.ts', kind: 'adapter', ownerTower: 'backend', content: "export type AppUser = { id: string; displayName: string; anonymous: boolean }\nexport interface AuthAdapter { getCurrentUser(): Promise<AppUser>; signInAnonymously(): Promise<AppUser> }\nexport const mockAuthAdapter: AuthAdapter = { async getCurrentUser() { return { id: 'preview-user', displayName: 'Preview User', anonymous: true } }, async signInAnonymously() { return { id: 'preview-user', displayName: 'Preview User', anonymous: true } } }\n", exports: ['AuthAdapter', 'mockAuthAdapter'], imports: [], metadata: {} },
  ]
  if (hasInteractiveSystems(input.entities)) {
    files.push({
      path: 'lib/interactive/InteractiveRuntime.ts',
      kind: 'adapter',
      ownerTower: 'interactive_systems',
      content: generatedInteractiveRuntimeSource(),
      exports: ['InteractiveRuntimeState', 'InteractiveCondition', 'InteractiveOutcome', 'createInitialRuntimeState', 'evaluateCondition', 'applyOutcome'],
      imports: [],
      metadata: {},
    })
    files.push({
      path: 'lib/interactive/MockInteractiveAdapters.ts',
      kind: 'adapter',
      ownerTower: 'interactive_systems',
      content: generatedInteractiveAdapterSource(),
      exports: ['InteractiveRuntimeAdapter', 'createMockInteractiveAdapter'],
      imports: ['InteractiveRuntime'],
      metadata: {},
    })
    files.push({
      path: 'lib/interactive/interactiveManifest.ts',
      kind: 'adapter',
      ownerTower: 'interactive_systems',
      content: generatedInteractiveManifestSource(input.entities),
      exports: ['interactiveManifest'],
      imports: [],
      metadata: {},
    })
  }
  for (const screen of screens.length > 0 ? screens : [{ key: 'home', name: 'Home Screen', summary: 'Start the app flow.', context: '', nodeType: 'screen', id: 'home', customProperties: { app: { route: '/' } }, metadata: {} }]) {
    const path = routeFileForScreen(screen)
    files.push({ path, kind: 'route', ownerTower: appProps(screen).ownerTower as string || 'screen_tower', content: reactNativeScreen(screen, colors), exports: [pascalCase(path)], imports: ['View', 'Text'], metadata: { sourceScreenKey: screen.key } })
  }
  for (const component of components) {
    const name = pascalCase(component.name || component.key)
    const path = textFrom(component, 'filePath') || `components/${name}.tsx`
    files.push({ path, kind: inferFileKind(path), ownerTower: appProps(component).ownerTower as string || 'component_tower', content: `import { Text, View } from 'react-native'\n\nexport function ${name}() {\n  return <View><Text>${name}</Text></View>\n}\n`, exports: [name], imports: ['View', 'Text'], metadata: { sourceComponentKey: component.key } })
  }
  files.push({ path: 'preview/sandbox.html', kind: 'asset', ownerTower: 'preview', content: buildAppSandboxPreviewHtml(input), exports: [], imports: [], metadata: { previewRole: 'sandbox_html' } })
  return files
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function toGeneratedFileInsertRows(input: {
  projectId: string
  draftId: string
  jobId: string
  files: AppGeneratedFileDraft[]
}) {
  return Promise.all(input.files.map(async (file) => ({
    project_id: input.projectId,
    draft_id: input.draftId,
    job_id: input.jobId,
    path: file.path,
    kind: file.kind,
    owner_tower: file.ownerTower,
    content: file.content,
    content_hash: await sha256Hex(file.content),
    exports: file.exports,
    imports: file.imports,
    metadata: file.metadata,
  })))
}
