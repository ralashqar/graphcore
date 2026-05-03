import { z } from 'zod'

import { APP_EXPO_BASE_FILE_PLAN, appCodeFilePlanSchema, createDefaultAppCodegenProjectPlan } from './appCodegen.ts'
import { isAppGraphNodeType } from './appGraph.ts'
import type { AssetDefinition } from './graphcore.ts'
import {
  collectInteractiveSystemRequirements,
  compileInteractiveManifest,
  evaluateInteractiveSystemReadiness,
  isInteractiveSystemNodeType,
} from './interactiveSystems.ts'
import type { WorldEntity, WorldRelationship } from './worldGraph.ts'

const looseRecordSchema = z.record(z.string(), z.unknown())

export const appPreviewLifecycleGateSchema = z.enum([
  'design_graph_draft',
  'design_graph_refined',
  'visual_prototype_ready',
  'implementation_plan_ready',
  'code_generated',
  'preview_passing',
])

export const appGenerationJobStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
])

export const appGenerationJobKindSchema = z.enum(['code_generation', 'preview_build'])

export const appGeneratedFileKindSchema = z.enum([
  'config',
  'route',
  'screen',
  'component',
  'hook',
  'adapter',
  'model',
  'test',
  'asset',
  'docs',
  'style',
])

export const appReadinessCategorySchema = z.enum([
  'Product',
  'UX Flows',
  'Screens',
  'Components',
  'Data/API',
  'Capabilities',
  'Interactive Systems',
  'Design System',
  'Visuals',
  'Design Approval',
  'Towers',
  'Code Files',
  'Generated Code',
  'Preview',
])

export const appReadinessSeveritySchema = z.enum(['blocker', 'warning'])

export const appReadinessFindingSchema = z.object({
  category: appReadinessCategorySchema,
  severity: appReadinessSeveritySchema,
  message: z.string().min(1),
  entityKey: z.string().optional(),
  action: z.string().optional(),
})

export const appPreviewReadinessSchema = z.object({
  currentGate: appPreviewLifecycleGateSchema,
  nextGate: appPreviewLifecycleGateSchema.nullable().default(null),
  nextAction: z.string().default(''),
  designApproved: z.boolean().default(false),
  designApprovalStale: z.boolean().default(false),
  designFingerprint: z.string().default(''),
  approvedDesignFingerprint: z.string().default(''),
  readinessPercent: z.number().int().min(0).max(100).default(0),
  blockers: z.array(appReadinessFindingSchema).default([]),
  warnings: z.array(appReadinessFindingSchema).default([]),
  counts: z.record(z.string(), z.number().int().nonnegative()).default({}),
  categoryStatus: z.record(z.string(), z.object({
    blockers: z.number().int().nonnegative().default(0),
    warnings: z.number().int().nonnegative().default(0),
    ready: z.boolean().default(false),
  })).default({}),
  gates: z.record(appPreviewLifecycleGateSchema, z.boolean()).default({
    design_graph_draft: false,
    design_graph_refined: false,
    visual_prototype_ready: false,
    implementation_plan_ready: false,
    code_generated: false,
    preview_passing: false,
  }),
})

export const appApprovedDesignScreenSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  route: z.string().default(''),
  purpose: z.string().default(''),
  states: z.array(z.string()).default([]),
  actions: z.array(z.string()).default([]),
  dataDependencies: z.array(z.string()).default([]),
  mockups: z.array(z.object({
    key: z.string().min(1),
    sourceAssetKey: z.string().default(''),
    visualSpecHash: z.string().default(''),
  })).default([]),
})

export const appApprovedDesignBundleSchema = z.object({
  status: z.literal('approved'),
  approvalId: z.string().min(1),
  approvedAt: z.string().min(1),
  sourceGate: z.literal('visual_prototype_ready'),
  designFingerprint: z.string().min(1),
  brandAtlasAssetKey: z.string().default(''),
  designSystemKeys: z.array(z.string()).default([]),
  routeScreenKeys: z.array(z.string()).default([]),
  screenMockupKeys: z.array(z.string()).default([]),
  mockupAssetKeys: z.array(z.string()).default([]),
  visualSpecScreenKeys: z.array(z.string()).default([]),
  visualSpecHashes: z.record(z.string(), z.string()).default({}),
  transitionKeys: z.array(z.string()).default([]),
  screens: z.array(appApprovedDesignScreenSchema).default([]),
  dataApiNodeKeys: z.array(z.string()).default([]),
  capabilityKeys: z.array(z.string()).default([]),
  interactiveSummary: looseRecordSchema.default({}),
})

export const appScreenVisualSpecSchema = z.object({
  screenKey: z.string().min(1),
  route: z.string().min(1),
  sourceAssetKey: z.string().min(1),
  viewport: z.object({
    width: z.literal(390),
    height: z.literal(844),
    device: z.literal('iphone'),
  }),
  designTokensUsed: z.array(z.string()).default([]),
  layoutTree: z.array(z.object({
    id: z.string().min(1),
    componentKey: z.string().optional(),
    role: z.enum(['header', 'navigation', 'content', 'form', 'card', 'cta', 'media', 'background']),
    frame: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
    style: looseRecordSchema.default({}),
    textStyle: looseRecordSchema.optional(),
    assetRequirementKey: z.string().optional(),
  })).default([]),
  sharedTokenCandidates: looseRecordSchema.default({}),
  requiredAssets: z.array(z.object({
    key: z.string().min(1),
    role: z.enum(['icon', 'illustration', 'photo', 'mascot', 'background', 'texture']),
    transparentBackground: z.boolean(),
    prompt: z.string().min(1),
    targetSize: z.string().min(1),
  })).default([]),
})

export const appCodeFileNodePropertiesSchema = z.object({
  filePath: z.string().min(1),
  ownerTower: z.string().min(1),
  fileKind: appGeneratedFileKindSchema,
  exports: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  dependsOn: z.array(z.string()).default([]),
  implementationSummary: z.string().default(''),
  publicInterface: z.string().default(''),
  visualSpecRefs: z.array(z.string()).default([]),
  testExpectations: z.array(z.string()).default([]),
})

export const appGenerationJobStepSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  status: appGenerationJobStatusSchema,
  stepKey: z.string(),
  label: z.string(),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  errorMessage: z.string().nullable().default(null),
  metadata: looseRecordSchema.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
})

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

export const appGenerationJobSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  draftId: z.string(),
  requestedBy: z.string().nullable().default(null),
  status: appGenerationJobStatusSchema,
  kind: appGenerationJobKindSchema,
  targetGate: appPreviewLifecycleGateSchema.default('code_generated'),
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
  kind: appGenerationJobKindSchema.default('code_generation'),
  targetGate: appPreviewLifecycleGateSchema.default('code_generated'),
  input: looseRecordSchema.default({}),
  metadata: looseRecordSchema.default({}),
})

export const appGenerationStatusRequestSchema = z.object({
  jobId: z.string().min(1),
})

export const appGenerationStatusResponseSchema = z.object({
  ok: z.literal(true),
  job: appGenerationJobSchema,
  terminal: z.boolean(),
})

export const appGenerationStartResponseSchema = appGenerationStatusResponseSchema

export const appGenerationCancelResponseSchema = z.object({
  ok: z.literal(true),
  job: appGenerationJobSchema,
})

export const appPreviewSessionResponseSchema = z.object({
  ok: z.literal(true),
  jobId: z.string().min(1),
  projectId: z.string().min(1),
  draftId: z.string().min(1),
  status: appGenerationJobStatusSchema,
  previewUrl: z.string().default(''),
  previewHtml: z.string().default(''),
  files: z.array(appGeneratedFileSchema).default([]),
})

export const appGeneratedFileDraftSchema = z.object({
  path: z.string().min(1),
  kind: appGeneratedFileKindSchema,
  ownerTower: z.string().default(''),
  content: z.string().default(''),
  exports: z.array(z.string()).default([]),
  imports: z.array(z.string()).default([]),
  metadata: looseRecordSchema.default({}),
})

export type AppPreviewLifecycleGate = z.infer<typeof appPreviewLifecycleGateSchema>
export type AppGenerationJobStatus = z.infer<typeof appGenerationJobStatusSchema>
export type AppGenerationJobKind = z.infer<typeof appGenerationJobKindSchema>
export type AppGeneratedFileKind = z.infer<typeof appGeneratedFileKindSchema>
export type AppReadinessFinding = z.infer<typeof appReadinessFindingSchema>
export type AppPreviewReadiness = z.infer<typeof appPreviewReadinessSchema>
export type AppApprovedDesignScreen = z.infer<typeof appApprovedDesignScreenSchema>
export type AppApprovedDesignBundle = z.infer<typeof appApprovedDesignBundleSchema>
export type AppScreenVisualSpec = z.infer<typeof appScreenVisualSpecSchema>
export type AppCodeFileNodeProperties = z.infer<typeof appCodeFileNodePropertiesSchema>
export type AppGenerationJob = z.infer<typeof appGenerationJobSchema>
export type AppGenerationStatusResponse = z.infer<typeof appGenerationStatusResponseSchema>
export type AppGenerationStartResponse = z.infer<typeof appGenerationStartResponseSchema>
export type AppGenerationCancelResponse = z.infer<typeof appGenerationCancelResponseSchema>
export type AppPreviewSessionResponse = z.infer<typeof appPreviewSessionResponseSchema>
export type AppGeneratedFileDraft = z.infer<typeof appGeneratedFileDraftSchema>

type AppPreviewSnapshot = {
  draft?: {
    metadata?: Record<string, unknown>
  }
  worldEntities: WorldEntity[]
  worldRelationships: WorldRelationship[]
  assets?: AssetDefinition[]
}

const GATE_ORDER: AppPreviewLifecycleGate[] = [
  'design_graph_draft',
  'design_graph_refined',
  'visual_prototype_ready',
  'implementation_plan_ready',
  'code_generated',
  'preview_passing',
]

const APP_READINESS_SCORE_CATEGORIES: AppReadinessFinding['category'][] = [
  'Product',
  'UX Flows',
  'Screens',
  'Components',
  'Data/API',
  'Capabilities',
  'Interactive Systems',
  'Design System',
  'Visuals',
  'Design Approval',
  'Towers',
  'Code Files',
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0) : []
}

function hasNonEmptyRecord(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0)
}

export function readAppNodeProperties(entity: Pick<WorldEntity, 'customProperties'>): Record<string, unknown> {
  return asRecord(asRecord(entity.customProperties).app)
}

export function readWorldWikiMetadata(metadata: Record<string, unknown> | undefined): Record<string, unknown> {
  return asRecord(asRecord(metadata).worldWiki)
}

function entityValue(entity: WorldEntity, key: string): unknown {
  const app = readAppNodeProperties(entity)
  if (key in app) return app[key]
  return asRecord(entity.customProperties)[key]
}

function textValue(entity: WorldEntity, key: string): string {
  const value = entityValue(entity, key)
  return typeof value === 'string' ? value.trim() : ''
}

function arrayValue(entity: WorldEntity, key: string): string[] {
  return asStringArray(entityValue(entity, key))
}

function collectCounts(entities: WorldEntity[]): Record<string, number> {
  return entities.reduce<Record<string, number>>((counts, entity) => {
    counts[entity.nodeType] = (counts[entity.nodeType] ?? 0) + 1
    return counts
  }, {})
}

function relationshipCountByVerb(relationships: WorldRelationship[]): Record<string, number> {
  return relationships.reduce<Record<string, number>>((counts, relationship) => {
    counts[relationship.verb] = (counts[relationship.verb] ?? 0) + 1
    return counts
  }, {})
}

function addFinding(
  target: AppReadinessFinding[],
  category: AppReadinessFinding['category'],
  message: string,
  severity: AppReadinessFinding['severity'] = 'blocker',
  entityKey?: string,
  action?: string,
) {
  target.push(appReadinessFindingSchema.parse({ category, message, severity, entityKey, action }))
}

function buildCategoryStatus(blockers: AppReadinessFinding[], warnings: AppReadinessFinding[]) {
  const status: Record<string, { blockers: number; warnings: number; ready: boolean }> = {}
  for (const category of APP_READINESS_SCORE_CATEGORIES) {
    const blockerCount = blockers.filter((finding) => finding.category === category).length
    const warningCount = warnings.filter((finding) => finding.category === category).length
    status[category] = {
      blockers: blockerCount,
      warnings: warningCount,
      ready: blockerCount === 0 && warningCount === 0,
    }
  }
  return status
}

function computeReadinessPercent(blockers: AppReadinessFinding[], warnings: AppReadinessFinding[]) {
  const categoryStatus = buildCategoryStatus(blockers, warnings)
  const total = APP_READINESS_SCORE_CATEGORIES.length
  const score = APP_READINESS_SCORE_CATEGORIES.reduce((sum, category) => {
    const status = categoryStatus[category]
    if (!status || status.blockers > 0) return sum
    if (status.warnings > 0) return sum + 0.65
    return sum + 1
  }, 0)
  return Math.max(0, Math.min(100, Math.round((score / total) * 100)))
}

function hasGeneratedBrandAtlas(snapshot: AppPreviewSnapshot): boolean {
  const worldWiki = readWorldWikiMetadata(snapshot.draft?.metadata)
  if (typeof worldWiki.brandAtlasAssetKey === 'string' && worldWiki.brandAtlasAssetKey.trim()) return true
  return (snapshot.assets ?? []).some((asset) => {
    const metadata = asRecord(asset.metadata)
    return metadata.jobKind === 'brand_atlas' || metadata.targetKind === 'brand_atlas'
  })
}

function hasVisualSpec(entity: WorldEntity): boolean {
  const app = readAppNodeProperties(entity)
  if (appScreenVisualSpecSchema.safeParse(app.visualSpec).success) return true
  if (appScreenVisualSpecSchema.safeParse(asRecord(entity.metadata).visualSpec).success) return true
  return false
}

function screenMockupTargetKey(mockup: WorldEntity): string {
  const app = readAppNodeProperties(mockup)
  const direct = app.screenKey ?? app.targetScreenKey ?? asRecord(mockup.metadata).screenKey
  return typeof direct === 'string' ? direct.trim() : ''
}

function screenMockupAssetKey(mockup: WorldEntity): string {
  const app = readAppNodeProperties(mockup)
  const direct = app.sourceAssetKey ?? app.assetKey ?? asRecord(mockup.metadata).sourceAssetKey ?? mockup.thumbnailAssetKey
  return typeof direct === 'string' ? direct.trim() : ''
}

export function readAppDesignApproval(entity: Pick<WorldEntity, 'customProperties' | 'metadata'>): Record<string, unknown> {
  const app = readAppNodeProperties(entity)
  return asRecord(app.designApproval ?? asRecord(entity.metadata).designApproval)
}

export function appDesignIsApproved(entity: Pick<WorldEntity, 'customProperties' | 'metadata'>): boolean {
  const approval = readAppDesignApproval(entity)
  return approval.status === 'approved'
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function shortHash(value: string): string {
  let hash = 5381
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(index)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function visualSpecHash(value: unknown): string {
  if (!value || (typeof value === 'object' && Object.keys(asRecord(value)).length === 0)) return ''
  return shortHash(stableStringify(value))
}

function readScreenVisualSpec(screen: WorldEntity, mockupsByScreenKey: Map<string, WorldEntity[]>): unknown {
  const screenApp = readAppNodeProperties(screen)
  if (appScreenVisualSpecSchema.safeParse(screenApp.visualSpec).success) return screenApp.visualSpec
  if (appScreenVisualSpecSchema.safeParse(asRecord(screen.metadata).visualSpec).success) return asRecord(screen.metadata).visualSpec
  const mockups = mockupsByScreenKey.get(screen.key) ?? []
  const mockupWithSpec = mockups.find(hasVisualSpec)
  if (!mockupWithSpec) return null
  const mockupApp = readAppNodeProperties(mockupWithSpec)
  return mockupApp.visualSpec ?? asRecord(mockupWithSpec.metadata).visualSpec ?? null
}

export function computeAppDesignFingerprint(snapshot: AppPreviewSnapshot): string {
  const appEntities = snapshot.worldEntities.filter((entity) => isAppGraphNodeType(entity.nodeType))
  const interactiveEntities = snapshot.worldEntities.filter((entity) => isInteractiveSystemNodeType(entity.nodeType))
  const worldWiki = readWorldWikiMetadata(snapshot.draft?.metadata)
  const mockupsByScreenKey = new Map<string, WorldEntity[]>()
  for (const mockup of appEntities.filter((entity) => entity.nodeType === 'screen_mockup')) {
    const screenKey = screenMockupTargetKey(mockup)
    if (!screenKey) continue
    mockupsByScreenKey.set(screenKey, [...(mockupsByScreenKey.get(screenKey) ?? []), mockup])
  }
  const screenNodes = appEntities
    .filter((entity) => entity.nodeType === 'screen')
    .map((screen) => ({
      key: screen.key,
      name: screen.name,
      route: textValue(screen, 'route'),
      purpose: textValue(screen, 'purpose') || screen.summary,
      states: arrayValue(screen, 'states'),
      actions: arrayValue(screen, 'actions'),
      dataDependencies: arrayValue(screen, 'dataDependencies'),
      visualSpecHash: visualSpecHash(readScreenVisualSpec(screen, mockupsByScreenKey)),
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
  const mockups = appEntities
    .filter((entity) => entity.nodeType === 'screen_mockup')
    .map((mockup) => ({
      key: mockup.key,
      targetScreenKey: screenMockupTargetKey(mockup),
      assetKey: screenMockupAssetKey(mockup),
      visualSpec: readAppNodeProperties(mockup).visualSpec ?? asRecord(mockup.metadata).visualSpec ?? null,
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
  const designSystems = appEntities
    .filter((entity) => entity.nodeType === 'design_system')
    .map((entity) => ({ key: entity.key, name: entity.name, summary: entity.summary, app: readAppNodeProperties(entity) }))
    .sort((left, right) => left.key.localeCompare(right.key))
  const transitions = snapshot.worldRelationships
    .filter((relationship) => relationship.verb === 'transitions_to')
    .map((relationship) => ({
      source: relationship.sourceEntityKey,
      target: relationship.targetEntityKey,
      notes: relationship.notes,
      metadata: relationship.metadata,
    }))
    .sort((left, right) => `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`))
  const interactive = interactiveEntities
    .map((entity) => ({
      key: entity.key,
      nodeType: entity.nodeType,
      name: entity.name,
      interactive: asRecord(asRecord(entity.customProperties).interactive),
      game: asRecord(asRecord(entity.customProperties).game),
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
  const interactiveRelationships = snapshot.worldRelationships
    .filter((relationship) => {
      const sourceInteractive = interactiveEntities.some((entity) => entity.key === relationship.sourceEntityKey)
      const targetInteractive = interactiveEntities.some((entity) => entity.key === relationship.targetEntityKey)
      return sourceInteractive || targetInteractive
    })
    .map((relationship) => ({
      source: relationship.sourceEntityKey,
      target: relationship.targetEntityKey,
      verb: relationship.verb,
      notes: relationship.notes,
      metadata: relationship.metadata,
    }))
    .sort((left, right) => `${left.source}:${left.verb}:${left.target}`.localeCompare(`${right.source}:${right.verb}:${right.target}`))
  return shortHash(stableStringify({
    brandAtlasAssetKey: typeof worldWiki.brandAtlasAssetKey === 'string' ? worldWiki.brandAtlasAssetKey : '',
    colorScheme: asRecord(worldWiki.colorScheme),
    artStyleDescription: typeof worldWiki.artStyleDescription === 'string' ? worldWiki.artStyleDescription : '',
    screenNodes,
    mockups,
    designSystems,
    transitions,
    interactive,
    interactiveRelationships,
  }))
}

export function buildApprovedAppDesignBundle(input: AppPreviewSnapshot & { approvedAt?: string; approvalId?: string }): AppApprovedDesignBundle {
  const activeAppEntities = input.worldEntities.filter((entity) => entity.status !== 'archived' && isAppGraphNodeType(entity.nodeType))
  const activeInteractiveEntities = input.worldEntities.filter((entity) => entity.status !== 'archived' && isInteractiveSystemNodeType(entity.nodeType))
  const worldWiki = readWorldWikiMetadata(input.draft?.metadata)
  const mockups = activeAppEntities.filter((entity) => entity.nodeType === 'screen_mockup')
  const mockupsByScreenKey = new Map<string, WorldEntity[]>()
  for (const mockup of mockups) {
    const screenKey = screenMockupTargetKey(mockup)
    if (!screenKey) continue
    mockupsByScreenKey.set(screenKey, [...(mockupsByScreenKey.get(screenKey) ?? []), mockup])
  }
  const routeScreens = activeAppEntities
    .filter((entity) => entity.nodeType === 'screen' && textValue(entity, 'route'))
    .sort((left, right) => textValue(left, 'route').localeCompare(textValue(right, 'route')) || left.key.localeCompare(right.key))
  const visualSpecHashes: Record<string, string> = {}
  const screens: AppApprovedDesignScreen[] = routeScreens.map((screen) => {
    const screenMockups = mockupsByScreenKey.get(screen.key) ?? []
    const screenVisualSpecHash = visualSpecHash(readScreenVisualSpec(screen, mockupsByScreenKey))
    if (screenVisualSpecHash) visualSpecHashes[screen.key] = screenVisualSpecHash
    return appApprovedDesignScreenSchema.parse({
      key: screen.key,
      name: screen.name,
      route: textValue(screen, 'route'),
      purpose: textValue(screen, 'purpose') || screen.summary,
      states: arrayValue(screen, 'states'),
      actions: arrayValue(screen, 'actions'),
      dataDependencies: arrayValue(screen, 'dataDependencies'),
      mockups: screenMockups.map((mockup) => {
        const spec = readAppNodeProperties(mockup).visualSpec ?? asRecord(mockup.metadata).visualSpec ?? null
        const hash = visualSpecHash(spec)
        if (hash) visualSpecHashes[mockup.key] = hash
        return {
          key: mockup.key,
          sourceAssetKey: screenMockupAssetKey(mockup),
          visualSpecHash: hash,
        }
      }),
    })
  })
  const screenMockupKeys = screens.flatMap((screen) => screen.mockups.map((mockup) => mockup.key))
  const mockupAssetKeys = screens.flatMap((screen) => screen.mockups.map((mockup) => mockup.sourceAssetKey).filter(Boolean))
  const interactiveSystems = collectInteractiveSystemRequirements({
    entities: [...activeAppEntities, ...activeInteractiveEntities],
  })
  let interactiveSummary: Record<string, unknown> = {}
  if (interactiveSystems.length > 0 || activeInteractiveEntities.length > 0) {
    const manifest = compileInteractiveManifest({
      entities: [...activeAppEntities, ...activeInteractiveEntities],
      relationships: input.worldRelationships,
      requiredSystems: interactiveSystems,
    })
    interactiveSummary = {
      requiredSystems: interactiveSystems,
      entityKeys: activeInteractiveEntities.map((entity) => entity.key),
      initialState: manifest.initialState,
      choiceCount: manifest.choices.length,
      conditionCount: manifest.conditions.length,
      outcomeCount: manifest.outcomes.length,
      dialogueCount: manifest.dialogueNodes.length,
      sceneCount: manifest.narrativeScenes.length,
      marketCount: manifest.markets.length,
      travelLinkCount: manifest.travelLinks.length,
    }
  }
  const approvedAt = input.approvedAt ?? new Date().toISOString()
  const designFingerprint = computeAppDesignFingerprint(input)
  return appApprovedDesignBundleSchema.parse({
    status: 'approved',
    approvalId: input.approvalId ?? `approval-${approvedAt.replace(/[^0-9a-z]+/gi, '-').replace(/-+$/g, '').toLowerCase()}-${designFingerprint}`,
    approvedAt,
    sourceGate: 'visual_prototype_ready',
    designFingerprint,
    brandAtlasAssetKey: typeof worldWiki.brandAtlasAssetKey === 'string' ? worldWiki.brandAtlasAssetKey : '',
    designSystemKeys: activeAppEntities.filter((entity) => entity.nodeType === 'design_system').map((entity) => entity.key),
    routeScreenKeys: screens.map((screen) => screen.key),
    screenMockupKeys,
    mockupAssetKeys,
    visualSpecScreenKeys: screens.filter((screen) => screen.mockups.some((mockup) => mockup.visualSpecHash) || Boolean(visualSpecHashes[screen.key])).map((screen) => screen.key),
    visualSpecHashes,
    transitionKeys: input.worldRelationships.filter((relationship) => relationship.verb === 'transitions_to').map((relationship) => relationship.key),
    screens,
    dataApiNodeKeys: activeAppEntities.filter((entity) => ['data_model', 'action', 'api_endpoint', 'backend_function', 'external_service'].includes(entity.nodeType)).map((entity) => entity.key),
    capabilityKeys: activeAppEntities.filter((entity) => entity.nodeType === 'capability').map((entity) => entity.key),
    interactiveSummary,
  })
}

export function evaluateAppPreviewReadiness(snapshot: AppPreviewSnapshot): AppPreviewReadiness {
  const appEntities = snapshot.worldEntities.filter((entity) => isAppGraphNodeType(entity.nodeType))
  const appAndInteractiveEntities = snapshot.worldEntities.filter((entity) => isAppGraphNodeType(entity.nodeType) || isInteractiveSystemNodeType(entity.nodeType))
  const counts = collectCounts(appEntities)
  const relationshipCounts = relationshipCountByVerb(snapshot.worldRelationships)
  const blockers: AppReadinessFinding[] = []
  const warnings: AppReadinessFinding[] = []
  const worldWiki = readWorldWikiMetadata(snapshot.draft?.metadata)

  const entitiesByType = new Map<string, WorldEntity[]>()
  for (const entity of appEntities) {
    const list = entitiesByType.get(entity.nodeType) ?? []
    list.push(entity)
    entitiesByType.set(entity.nodeType, list)
  }

  const appNodes = entitiesByType.get('app') ?? []
  const flowNodes = entitiesByType.get('user_flow') ?? []
  const screenNodes = entitiesByType.get('screen') ?? []
  const componentNodes = entitiesByType.get('component') ?? []
  const dataModels = entitiesByType.get('data_model') ?? []
  const actionNodes = entitiesByType.get('action') ?? []
  const apiNodes = entitiesByType.get('api_endpoint') ?? []
  const capabilityNodes = entitiesByType.get('capability') ?? []
  const designSystems = entitiesByType.get('design_system') ?? []
  const towerNodes = entitiesByType.get('tower') ?? []
  const codeFiles = entitiesByType.get('code_file') ?? []
  const mockups = entitiesByType.get('screen_mockup') ?? []
  const designFingerprint = computeAppDesignFingerprint(snapshot)
  const approvedDesignFingerprint = appNodes
    .map((entity) => readAppDesignApproval(entity).designFingerprint)
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0) ?? ''
  const designApproved = appNodes.some(appDesignIsApproved)
  const designApprovalStale = Boolean(designApproved && approvedDesignFingerprint && approvedDesignFingerprint !== designFingerprint)

  if (appNodes.length === 0) addFinding(blockers, 'Product', 'Add a top-level app identity node with promise, category, platform targets, and core loop.')
  if (flowNodes.length === 0) addFinding(blockers, 'UX Flows', 'Add route-bearing user flow nodes for onboarding, first success, daily return, paywall, and sharing.')
  if (screenNodes.length === 0) addFinding(blockers, 'Screens', 'Add screen nodes with routes, purpose, states, actions, and data dependencies.')

  if (appNodes.length > 0 && !textValue(appNodes[0], 'coreLoop')) {
    addFinding(warnings, 'Product', 'The app identity should define a core loop.', 'warning', appNodes[0].key)
  }

  if (componentNodes.length === 0) addFinding(blockers, 'Components', 'Break screens into reusable components with props, states, interactions, and file mapping.')
  if (dataModels.length === 0) addFinding(blockers, 'Data/API', 'Add app data model nodes for profile, generated results, subscription state, history, or other durable entities.')
  if (actionNodes.length === 0) addFinding(blockers, 'Data/API', 'Add action nodes for user/system operations such as create, generate, share, subscribe, or export.')
  if (apiNodes.length === 0) addFinding(blockers, 'Data/API', 'Add API endpoint nodes with method, path, schemas, auth requirements, and associated actions.')
  if (capabilityNodes.length === 0) addFinding(blockers, 'Capabilities', 'Add capability nodes that declare web preview, Expo Go, dev build, and production constraints.')
  if (designSystems.length === 0) addFinding(blockers, 'Design System', 'Add a design system node with colors, typography, spacing, radius, icon, and animation direction.')

  for (const screen of screenNodes) {
    if (!textValue(screen, 'route')) addFinding(blockers, 'Screens', `${screen.name} needs a route.`, 'blocker', screen.key)
    if (!textValue(screen, 'purpose') && !screen.summary.trim()) addFinding(blockers, 'Screens', `${screen.name} needs a clear screen purpose.`, 'blocker', screen.key)
    if (arrayValue(screen, 'states').length === 0) addFinding(warnings, 'Screens', `${screen.name} should define loading, empty, error, and success states.`, 'warning', screen.key)
    if (arrayValue(screen, 'actions').length === 0 && relationshipCounts.emits === 0) addFinding(warnings, 'Screens', `${screen.name} should list connected actions or emit relationships.`, 'warning', screen.key)
    if (arrayValue(screen, 'dataDependencies').length === 0 && relationshipCounts.reads === 0) addFinding(warnings, 'Screens', `${screen.name} should list data dependencies or reads relationships.`, 'warning', screen.key)
  }

  for (const component of componentNodes) {
    if (!hasNonEmptyRecord(entityValue(component, 'props'))) addFinding(warnings, 'Components', `${component.name} should define props.`, 'warning', component.key)
    if (arrayValue(component, 'states').length === 0) addFinding(warnings, 'Components', `${component.name} should define component states.`, 'warning', component.key)
    if (!textValue(component, 'filePath')) addFinding(warnings, 'Components', `${component.name} should include a target file path.`, 'warning', component.key)
  }

  for (const api of apiNodes) {
    if (!textValue(api, 'method')) addFinding(blockers, 'Data/API', `${api.name} needs an HTTP method.`, 'blocker', api.key)
    if (!textValue(api, 'path')) addFinding(blockers, 'Data/API', `${api.name} needs a route path.`, 'blocker', api.key)
    if (!hasNonEmptyRecord(entityValue(api, 'inputSchema'))) addFinding(warnings, 'Data/API', `${api.name} should define an input schema.`, 'warning', api.key)
    if (!hasNonEmptyRecord(entityValue(api, 'outputSchema'))) addFinding(warnings, 'Data/API', `${api.name} should define an output schema.`, 'warning', api.key)
  }

  for (const capability of capabilityNodes) {
    const rule = asRecord(entityValue(capability, 'capabilityRule'))
    if (!rule.webPreview) addFinding(warnings, 'Capabilities', `${capability.name} should define web preview support or fallback.`, 'warning', capability.key)
    if (!rule.expoGo) addFinding(warnings, 'Capabilities', `${capability.name} should define Expo Go support.`, 'warning', capability.key)
    if (typeof rule.requiresDevBuild !== 'boolean') addFinding(warnings, 'Capabilities', `${capability.name} should declare whether it requires a custom dev build.`, 'warning', capability.key)
  }

  const requiredInteractiveSystems = collectInteractiveSystemRequirements({ entities: appAndInteractiveEntities })
  if (requiredInteractiveSystems.length > 0) {
    const interactiveReadiness = evaluateInteractiveSystemReadiness({
      entities: appAndInteractiveEntities,
      relationships: snapshot.worldRelationships,
      requiredSystems: requiredInteractiveSystems,
    })
    for (const finding of interactiveReadiness.blockers) {
      addFinding(
        blockers,
        'Interactive Systems',
        `${finding.category.replace(/_/g, ' ')}: ${finding.message}`,
        'blocker',
        finding.entityKey,
        'Refine interactive systems',
      )
    }
    for (const finding of interactiveReadiness.warnings) {
      addFinding(
        warnings,
        'Interactive Systems',
        `${finding.category.replace(/_/g, ' ')}: ${finding.message}`,
        'warning',
        finding.entityKey,
        'Refine interactive systems',
      )
    }
  }

  if (!worldWiki.artStyleDescription) addFinding(blockers, 'Design System', 'Set the app-specific art style description.')
  if (!worldWiki.brandAtlasPrompt) addFinding(blockers, 'Design System', 'Set the brand atlas image prompt.')
  if (!hasNonEmptyRecord(worldWiki.colorScheme)) addFinding(blockers, 'Design System', 'Set app colors with primary, secondary, and tertiary values.')

  const brandAtlasReady = hasGeneratedBrandAtlas(snapshot)
  const routeScreens = screenNodes.filter((screen) => textValue(screen, 'route'))
  const hasScreenTransitions = routeScreens.length <= 1 || snapshot.worldRelationships.some((relationship) => (
    relationship.verb === 'transitions_to'
    && routeScreens.some((screen) => screen.key === relationship.sourceEntityKey)
    && routeScreens.some((screen) => screen.key === relationship.targetEntityKey)
  ))
  const screenMockupsByScreenKey = new Map<string, WorldEntity[]>()
  for (const mockup of mockups) {
    const screenKey = screenMockupTargetKey(mockup)
    if (!screenKey) continue
    screenMockupsByScreenKey.set(screenKey, [...(screenMockupsByScreenKey.get(screenKey) ?? []), mockup])
  }
  const screensMissingArt = routeScreens.filter((screen) => {
    const screenMockups = screenMockupsByScreenKey.get(screen.key) ?? []
    return !screenMockups.some((mockup) => screenMockupAssetKey(mockup))
  })
  const screensMissingVisualSpecs = routeScreens.filter((screen) => {
    if (hasVisualSpec(screen)) return false
    const screenMockups = screenMockupsByScreenKey.get(screen.key) ?? []
    return !screenMockups.some(hasVisualSpec)
  })
  const screenArtReady = routeScreens.length > 0 && screensMissingArt.length === 0
  const screenVisualSpecsReady = routeScreens.length > 0 && screensMissingVisualSpecs.length === 0
  const screenVisualsReady = screenArtReady && screenVisualSpecsReady
  if (!brandAtlasReady) addFinding(blockers, 'Visuals', 'Generate a brand atlas image before screen mockups.')
  if (routeScreens.length === 0) addFinding(blockers, 'Visuals', 'Add route-bearing screens before generating screen art.')
  if (routeScreens.length > 1 && !hasScreenTransitions) {
    addFinding(blockers, 'Visuals', 'Add screen transitions so the static prototype can be clicked through.')
  }
  if (routeScreens.length > 0 && !screenArtReady) {
    const sample = screensMissingArt.slice(0, 3).map((screen) => screen.name).join(', ')
    addFinding(blockers, 'Visuals', `Generate screen art for ${screensMissingArt.length} route-bearing screen${screensMissingArt.length === 1 ? '' : 's'}${sample ? `: ${sample}` : ''}.`)
  }
  if (screenArtReady && !screenVisualSpecsReady) {
    const sample = screensMissingVisualSpecs.slice(0, 3).map((screen) => screen.name).join(', ')
    addFinding(blockers, 'Visuals', `Analyze screen art into layout/style specs for ${screensMissingVisualSpecs.length} screen${screensMissingVisualSpecs.length === 1 ? '' : 's'}${sample ? `: ${sample}` : ''}.`)
  }

  const designBlockerCategories: AppReadinessFinding['category'][] = [
    'Product',
    'UX Flows',
    'Screens',
    'Components',
    'Data/API',
    'Capabilities',
    'Interactive Systems',
    'Design System',
  ]
  const visualBlockerCategories: AppReadinessFinding['category'][] = [...designBlockerCategories, 'Visuals']

  const designGraphDraft = appNodes.length > 0 && flowNodes.length > 0 && screenNodes.length > 0
  const designGraphRefined = designGraphDraft
    && componentNodes.length > 0
    && dataModels.length > 0
    && actionNodes.length > 0
    && apiNodes.length > 0
    && capabilityNodes.length > 0
    && designSystems.length > 0
    && blockers.every((finding) => !designBlockerCategories.includes(finding.category))
  const visualPrototypeReady = designGraphRefined && brandAtlasReady && screenVisualsReady && hasScreenTransitions

  if (visualPrototypeReady && !designApproved) {
    addFinding(warnings, 'Design Approval', 'Approve the static design prototype before generating implementation towers and code files.', 'warning')
  }
  if (designApprovalStale) {
    addFinding(blockers, 'Design Approval', 'Design changed since approval. Reapprove the visual prototype before implementation planning or code generation.', 'blocker')
  }
  if (designApproved && towerNodes.length === 0) addFinding(blockers, 'Towers', 'Generate implementation tower nodes from the approved design graph.')
  if (designApproved && codeFiles.length === 0) addFinding(blockers, 'Code Files', 'Generate code_file nodes from the approved design graph and shared contracts.')

  const hasRelationship = (sourceKey: string, verb: string, targetKey?: string) => snapshot.worldRelationships.some((relationship) => (
    relationship.sourceEntityKey === sourceKey
    && relationship.verb === verb
    && (!targetKey || relationship.targetEntityKey === targetKey)
  ))
  const towerKeys = new Set(towerNodes.map((tower) => tower.key))
  const codeFilePaths = new Set<string>()
  for (const codeFile of codeFiles) {
    const app = readAppNodeProperties(codeFile)
    const filePath = typeof app.filePath === 'string' ? app.filePath : textValue(codeFile, 'filePath')
    const ownerTower = typeof app.ownerTower === 'string' ? app.ownerTower : textValue(codeFile, 'ownerTower')
    const fileKind = typeof app.fileKind === 'string' ? app.fileKind : textValue(codeFile, 'fileKind')
    if (!filePath.trim()) addFinding(blockers, 'Code Files', `${codeFile.name} needs filePath.`, 'blocker', codeFile.key)
    if (!ownerTower.trim()) addFinding(blockers, 'Code Files', `${codeFile.name} needs ownerTower.`, 'blocker', codeFile.key)
    if (!fileKind.trim()) addFinding(blockers, 'Code Files', `${codeFile.name} needs fileKind.`, 'blocker', codeFile.key)
    if (!Array.isArray(app.exports)) addFinding(warnings, 'Code Files', `${codeFile.name} should list exports.`, 'warning', codeFile.key)
    if (!Array.isArray(app.imports)) addFinding(warnings, 'Code Files', `${codeFile.name} should list imports.`, 'warning', codeFile.key)
    if (!Array.isArray(app.dependsOn)) addFinding(warnings, 'Code Files', `${codeFile.name} should list dependsOn.`, 'warning', codeFile.key)
    if (!textValue(codeFile, 'implementationSummary') && typeof app.implementationSummary !== 'string') addFinding(warnings, 'Code Files', `${codeFile.name} should include an implementationSummary.`, 'warning', codeFile.key)
    if (!textValue(codeFile, 'publicInterface') && typeof app.publicInterface !== 'string') addFinding(warnings, 'Code Files', `${codeFile.name} should include publicInterface.`, 'warning', codeFile.key)
    if (!Array.isArray(app.testExpectations)) addFinding(warnings, 'Code Files', `${codeFile.name} should list testExpectations.`, 'warning', codeFile.key)
    if (filePath.trim()) codeFilePaths.add(filePath.trim())
    if (designApproved && towerNodes.length > 0) {
      const ownedByKnownTower = hasRelationship(codeFile.key, 'owned_by_tower') || (ownerTower.trim() && (towerKeys.has(ownerTower.trim()) || towerNodes.some((tower) => tower.name === ownerTower.trim())))
      if (!ownedByKnownTower) addFinding(blockers, 'Code Files', `${codeFile.name} should be owned by a tower through ownerTower or owned_by_tower.`, 'blocker', codeFile.key)
    }
  }
  if (designApproved && towerNodes.length > 0 && codeFiles.length > 0) {
    for (const tower of towerNodes) {
      const ownsFile = codeFiles.some((codeFile) => {
        const app = readAppNodeProperties(codeFile)
        const ownerTower = typeof app.ownerTower === 'string' ? app.ownerTower : textValue(codeFile, 'ownerTower')
        return ownerTower === tower.key || ownerTower === tower.name || hasRelationship(codeFile.key, 'owned_by_tower', tower.key)
      })
      if (!ownsFile) addFinding(warnings, 'Towers', `${tower.name} should own at least one code_file.`, 'warning', tower.key)
    }
    const implementationVerbs = new Set(snapshot.worldRelationships.map((relationship) => relationship.verb))
    for (const verb of ['implemented_as', 'owned_by_tower', 'depends_on']) {
      if (!implementationVerbs.has(verb)) addFinding(warnings, 'Code Files', `Implementation plan should include ${verb} relationships.`, 'warning')
    }
    if (requiredInteractiveSystems.length > 0) {
      for (const requiredPath of ['lib/interactive/InteractiveRuntime.ts', 'lib/interactive/MockInteractiveAdapters.ts', 'lib/interactive/interactiveManifest.ts']) {
        if (!codeFilePaths.has(requiredPath)) addFinding(blockers, 'Code Files', `Interactive apps need ${requiredPath} in the implementation plan.`, 'blocker')
      }
    }
  }

  const implementationPlanReady = visualPrototypeReady
    && designApproved
    && !designApprovalStale
    && towerNodes.length > 0
    && codeFiles.length > 0
    && blockers.every((finding) => !['Towers', 'Code Files'].includes(finding.category))
  const codeGenerated = false
  const previewPassing = false
  const gates = {
    design_graph_draft: designGraphDraft,
    design_graph_refined: designGraphRefined,
    visual_prototype_ready: visualPrototypeReady,
    implementation_plan_ready: implementationPlanReady,
    code_generated: codeGenerated,
    preview_passing: previewPassing,
  }

  const currentGate = [...GATE_ORDER].reverse().find((gate) => gates[gate]) ?? 'design_graph_draft'
  const nextGate = GATE_ORDER.find((gate) => !gates[gate]) ?? null
  const nextAction = nextGate === 'design_graph_draft'
    ? 'Create initial App Graph'
    : nextGate === 'design_graph_refined'
      ? 'Refine Design Graph'
      : nextGate === 'visual_prototype_ready'
        ? visualBlockerCategories.some((category) => blockers.some((finding) => finding.category === category))
          ? 'Complete Visual Prototype'
          : 'Preview Static Flow'
        : nextGate === 'implementation_plan_ready'
          ? designApproved ? 'Generate Implementation Plan' : 'Approve Design For Build'
          : nextGate === 'code_generated'
            ? 'Build Preview App'
            : nextGate === 'preview_passing'
              ? 'Open Preview'
              : 'Preview is ready'

  return appPreviewReadinessSchema.parse({
    currentGate,
    nextGate,
    nextAction,
    designApproved,
    designApprovalStale,
    designFingerprint,
    approvedDesignFingerprint,
    readinessPercent: computeReadinessPercent(blockers, warnings),
    blockers,
    warnings,
    counts,
    categoryStatus: buildCategoryStatus(blockers, warnings),
    gates,
  })
}

function pascalCase(value: string): string {
  const source = value.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+/g, ' ')
  const result = source
    .split(' ')
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join('')
  return result || 'Generated'
}

function pathSafeName(entity: WorldEntity): string {
  return (textValue(entity, 'route') || entity.name || entity.key)
    .replace(/^\//, '')
    .replace(/\[[^\]]+\]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || entity.key
}

function inferFileKind(path: string): z.infer<typeof appGeneratedFileKindSchema> {
  if (path.endsWith('.json')) return 'config'
  if (path.endsWith('.md')) return 'docs'
  if (path.includes('/components/')) return 'component'
  if (path.includes('/hooks/')) return 'hook'
  if (path.includes('/backend/') || path.includes('/adapters/') || path.includes('/interactive/')) return 'adapter'
  if (path.includes('/types/') || path.includes('/models/')) return 'model'
  if (path.includes('/__tests__/') || path.endsWith('.test.ts') || path.endsWith('.test.tsx')) return 'test'
  if (path.startsWith('app/')) return 'route'
  if (path.includes('/styles') || path.includes('tokens')) return 'style'
  return 'screen'
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function cssColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed) ? trimmed : fallback
}

function routeForScreen(screen: WorldEntity): string {
  const route = textValue(screen, 'route')
  if (route) return route.startsWith('/') ? route : `/${route}`
  return `/${pathSafeName(screen)}`
}

function componentNameForScreen(screen: WorldEntity): string {
  return `${pascalCase(pathSafeName(screen))}Screen`
}

function routeFilePathForScreen(screen: WorldEntity): string {
  const routeName = pathSafeName(screen)
  return routeName === 'index' || routeName === 'home' ? 'app/index.tsx' : `app/${routeName}.tsx`
}

function buildReactNativeScreenFile(screen: WorldEntity, colorScheme: Record<string, unknown>): string {
  const componentName = componentNameForScreen(screen)
  const primary = cssColor(colorScheme.primary, '#2563eb')
  const secondary = cssColor(colorScheme.secondary, '#14b8a6')
  const tertiary = cssColor(colorScheme.tertiary, '#f8fafc')
  return `import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'

export function ${componentName}() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>${screen.nodeType.replace(/_/g, ' ')}</Text>
        <Text style={styles.title}>${screen.name.replace(/`/g, "'")}</Text>
        <Text style={styles.summary}>${(screen.summary || screen.context || 'Generated app screen.').replace(/`/g, "'")}</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Purpose</Text>
        <Text style={styles.panelText}>${(textValue(screen, 'purpose') || screen.summary || 'Define this screen purpose in the app graph.').replace(/`/g, "'")}</Text>
      </View>
      <Pressable style={styles.cta}>
        <Text style={styles.ctaText}>Continue</Text>
      </Pressable>
    </ScrollView>
  )
}

export default ${componentName}

const styles = StyleSheet.create({
  page: {
    minHeight: '100%',
    padding: 24,
    gap: 18,
    backgroundColor: '${tertiary}',
  },
  header: {
    gap: 10,
    paddingTop: 44,
  },
  eyebrow: {
    color: '${secondary}',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: '#0f172a',
    fontSize: 34,
    fontWeight: '800',
  },
  summary: {
    color: '#334155',
    fontSize: 16,
    lineHeight: 23,
  },
  panel: {
    borderRadius: 24,
    padding: 20,
    backgroundColor: '#ffffff',
  },
  panelTitle: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '800',
  },
  panelText: {
    color: '#475569',
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  cta: {
    alignItems: 'center',
    borderRadius: 999,
    paddingVertical: 16,
    backgroundColor: '${primary}',
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
})
`
}

export function buildAppSandboxPreviewHtml(input: {
  projectName?: string
  draftMetadata?: Record<string, unknown>
  entities: WorldEntity[]
}): string {
  const appNode = input.entities.find((entity) => entity.nodeType === 'app')
  const screens = input.entities.filter((entity) => entity.nodeType === 'screen')
  const features = input.entities.filter((entity) => entity.nodeType === 'feature').slice(0, 5)
  const worldWiki = readWorldWikiMetadata(input.draftMetadata)
  const colorScheme = asRecord(worldWiki.colorScheme)
  const primary = cssColor(colorScheme.primary, '#2563eb')
  const secondary = cssColor(colorScheme.secondary, '#14b8a6')
  const tertiary = cssColor(colorScheme.tertiary, '#f8fafc')
  const title = appNode?.name || input.projectName || 'Generated App'
  const summary = appNode?.summary || appNode?.context || 'A graph-generated app preview.'
  const screenCards = screens.length > 0 ? screens : [
    entityFallback('home', 'Home Screen', 'Start the app flow.'),
  ]

  const buttons = screenCards.map((screen, index) => (
    `<button class="tab${index === 0 ? ' active' : ''}" data-screen="${escapeHtml(screen.key)}">${escapeHtml(screen.name)}</button>`
  )).join('')

  const panels = screenCards.map((screen, index) => {
    const states = arrayValue(screen, 'states')
    const route = routeForScreen(screen)
    return `<section class="screen${index === 0 ? ' active' : ''}" data-screen="${escapeHtml(screen.key)}">
      <div class="screen-top">
        <span>${escapeHtml(route)}</span>
        <strong>${escapeHtml(index + 1).padStart(2, '0')}</strong>
      </div>
      <h2>${escapeHtml(screen.name)}</h2>
      <p>${escapeHtml(screen.summary || screen.context || textValue(screen, 'purpose') || 'Generated route screen.')}</p>
      <div class="phone-card">
        <span>Purpose</span>
        <p>${escapeHtml(textValue(screen, 'purpose') || 'Define this purpose during Refine App Graph.')}</p>
      </div>
      <div class="state-row">
        ${(states.length > 0 ? states : ['empty', 'loading', 'success']).map((state) => `<span>${escapeHtml(state)}</span>`).join('')}
      </div>
      <button class="primary-action">Continue</button>
    </section>`
  }).join('')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} Preview</title>
  <style>
    :root {
      color-scheme: light;
      --primary: ${primary};
      --secondary: ${secondary};
      --tertiary: ${tertiary};
      --ink: #0f172a;
      --muted: #64748b;
      --surface: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0a0f1f;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .device {
      width: min(390px, 100vw);
      height: min(844px, 100vh);
      overflow: hidden;
      border: 10px solid #111827;
      border-radius: 46px;
      background: var(--tertiary);
      box-shadow: 0 30px 90px rgba(0,0,0,.38);
      position: relative;
    }
    .notch {
      width: 116px;
      height: 32px;
      position: absolute;
      left: 50%;
      top: 8px;
      z-index: 3;
      transform: translateX(-50%);
      border-radius: 0 0 18px 18px;
      background: #111827;
    }
    .app {
      height: 100%;
      overflow: hidden;
      display: grid;
      grid-template-rows: auto 1fr auto;
      background:
        radial-gradient(circle at 16% 12%, color-mix(in srgb, var(--secondary) 22%, transparent), transparent 30%),
        linear-gradient(180deg, var(--tertiary), #fff 58%);
    }
    header {
      padding: 58px 24px 14px;
    }
    .eyebrow {
      color: var(--secondary);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0;
      text-transform: uppercase;
    }
    h1, h2, p { margin: 0; }
    h1 {
      margin-top: 8px;
      color: var(--ink);
      font-size: 31px;
      line-height: 1.03;
    }
    header p {
      margin-top: 10px;
      color: var(--muted);
      font-size: 14px;
      line-height: 1.45;
    }
    main {
      min-height: 0;
      overflow: hidden;
      padding: 0 18px 18px;
    }
    .screen {
      display: none;
      height: 100%;
      overflow-y: auto;
      padding: 18px;
      border-radius: 28px;
      background: rgba(255,255,255,.88);
      border: 1px solid rgba(15,23,42,.08);
      box-shadow: 0 18px 50px rgba(15,23,42,.10);
    }
    .screen.active { display: block; }
    .screen-top {
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    .screen h2 {
      margin-top: 26px;
      color: var(--ink);
      font-size: 28px;
      line-height: 1.05;
    }
    .screen > p {
      margin-top: 10px;
      color: #475569;
      font-size: 15px;
      line-height: 1.45;
    }
    .phone-card {
      margin-top: 22px;
      padding: 18px;
      border-radius: 22px;
      background: color-mix(in srgb, var(--primary) 9%, white);
    }
    .phone-card span {
      color: var(--primary);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .phone-card p {
      margin-top: 8px;
      color: var(--ink);
      font-size: 15px;
      line-height: 1.4;
    }
    .state-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 18px;
    }
    .state-row span {
      padding: 7px 10px;
      border-radius: 999px;
      background: #f1f5f9;
      color: #334155;
      font-size: 12px;
      font-weight: 700;
    }
    .primary-action {
      width: 100%;
      margin-top: 22px;
      border: 0;
      border-radius: 999px;
      padding: 15px 18px;
      color: #fff;
      background: var(--primary);
      font-size: 15px;
      font-weight: 850;
    }
    nav {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      padding: 12px 16px 22px;
      border-top: 1px solid rgba(15,23,42,.08);
      background: rgba(255,255,255,.78);
    }
    .tab {
      flex: 0 0 auto;
      border: 0;
      border-radius: 999px;
      padding: 10px 12px;
      background: #eef2f7;
      color: #334155;
      font-size: 12px;
      font-weight: 800;
      white-space: nowrap;
    }
    .tab.active {
      background: var(--primary);
      color: #fff;
    }
    .features {
      display: flex;
      gap: 8px;
      margin-top: 14px;
      overflow: hidden;
    }
    .features span {
      max-width: 120px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      padding: 7px 10px;
      border-radius: 999px;
      background: rgba(255,255,255,.75);
      color: #334155;
      font-size: 11px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="device">
    <div class="notch"></div>
    <div class="app">
      <header>
        <span class="eyebrow">Sandbox preview</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(summary)}</p>
        ${features.length > 0 ? `<div class="features">${features.map((feature) => `<span>${escapeHtml(feature.name)}</span>`).join('')}</div>` : ''}
      </header>
      <main>${panels}</main>
      <nav>${buttons}</nav>
    </div>
  </div>
  <script>
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const screens = Array.from(document.querySelectorAll('.screen'));
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-screen');
        tabs.forEach((entry) => entry.classList.toggle('active', entry === tab));
        screens.forEach((entry) => entry.classList.toggle('active', entry.getAttribute('data-screen') === key));
      });
    });
  </script>
</body>
</html>`
}

function entityFallback(key: string, name: string, summary: string): WorldEntity {
  return {
    id: key,
    key,
    name,
    summary,
    context: '',
    nodeType: 'screen',
    aliases: [],
    tags: [],
    status: 'active',
    thumbnailAssetKey: null,
    linkedDefinitionKey: null,
    source: 'inferred',
    customProperties: { app: { route: '/' } },
    metadata: {},
  }
}

function buildGeneratedInteractiveRuntimeSource() {
  return `export type InteractiveRuntimeState = {
  inventoryKeys: string[]
  currency: Record<string, number>
  tokenKeys: string[]
  stats: Record<string, number>
  state: Record<string, unknown>
  currentLocationKey: string | null
  currentSpotKey: string | null
  currentSceneKey: string | null
  currentDialogueKey: string | null
  visitedLocationKeys: string[]
}

export type InteractiveCondition = {
  kind: 'has_item' | 'has_token' | 'has_currency' | 'state_equals' | 'visited_location' | 'stat_eq' | 'stat_gte' | 'stat_lte' | 'stat_gt' | 'stat_lt'
  targetKey: string
  operator?: 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt' | 'exists' | 'missing'
  value?: string | number | boolean
  quantity?: number
}

export type InteractiveOutcome = {
  kind: 'grant_item' | 'remove_item' | 'grant_token' | 'remove_token' | 'remove_currency' | 'grant_currency' | 'set_state' | 'clear_state' | 'set_stat' | 'increase_stat' | 'decrease_stat' | 'clamp_stat' | 'unlock' | 'travel_to' | 'branch_to' | 'set_current_dialogue' | 'set_current_scene'
  targetKey: string
  value?: string | number | boolean
  quantity?: number
}

function compare(left: unknown, operator: InteractiveCondition['operator'] = 'exists', right: unknown) {
  if (operator === 'exists') return left !== undefined && left !== null && left !== false
  if (operator === 'missing') return left === undefined || left === null || left === false
  if (operator === 'eq') return left === right
  if (operator === 'neq') return left !== right
  if (typeof left !== 'number' || typeof right !== 'number') return false
  if (operator === 'gte') return left >= right
  if (operator === 'lte') return left <= right
  if (operator === 'gt') return left > right
  if (operator === 'lt') return left < right
  return false
}

export function createInitialRuntimeState(manifest: { initialState: InteractiveRuntimeState }) {
  return { ...manifest.initialState, inventoryKeys: [...manifest.initialState.inventoryKeys], tokenKeys: [...manifest.initialState.tokenKeys], currency: { ...manifest.initialState.currency }, stats: { ...manifest.initialState.stats }, state: { ...manifest.initialState.state }, visitedLocationKeys: [...manifest.initialState.visitedLocationKeys] }
}

export function evaluateCondition(condition: InteractiveCondition, state: InteractiveRuntimeState) {
  const quantity = condition.quantity ?? 1
  if (condition.kind === 'has_item') return compare(state.inventoryKeys.filter((key) => key === condition.targetKey).length, condition.operator === 'exists' ? 'gte' : condition.operator, condition.value ?? quantity)
  if (condition.kind === 'has_token') return compare(state.tokenKeys.includes(condition.targetKey), condition.operator, condition.value ?? true)
  if (condition.kind === 'has_currency') return compare(state.currency[condition.targetKey] ?? 0, condition.operator === 'exists' ? 'gte' : condition.operator, condition.value ?? quantity)
  if (condition.kind === 'state_equals') return compare(state.state[condition.targetKey], condition.operator, condition.value)
  if (condition.kind === 'visited_location') return compare(state.visitedLocationKeys.includes(condition.targetKey), condition.operator, condition.value ?? true)
  if (condition.kind === 'stat_eq') return compare(state.stats[condition.targetKey] ?? 0, 'eq', condition.value ?? quantity)
  if (condition.kind === 'stat_gte') return compare(state.stats[condition.targetKey] ?? 0, 'gte', condition.value ?? quantity)
  if (condition.kind === 'stat_lte') return compare(state.stats[condition.targetKey] ?? 0, 'lte', condition.value ?? quantity)
  if (condition.kind === 'stat_gt') return compare(state.stats[condition.targetKey] ?? 0, 'gt', condition.value ?? quantity)
  if (condition.kind === 'stat_lt') return compare(state.stats[condition.targetKey] ?? 0, 'lt', condition.value ?? quantity)
  return false
}

export function applyOutcome(outcome: InteractiveOutcome, state: InteractiveRuntimeState): InteractiveRuntimeState {
  const quantity = outcome.quantity ?? 1
  const next: InteractiveRuntimeState = { ...state, inventoryKeys: [...state.inventoryKeys], tokenKeys: [...state.tokenKeys], currency: { ...state.currency }, stats: { ...state.stats }, state: { ...state.state }, visitedLocationKeys: [...state.visitedLocationKeys] }
  if (outcome.kind === 'grant_item') next.inventoryKeys.push(...Array.from({ length: quantity }, () => outcome.targetKey))
  if (outcome.kind === 'remove_item') { let remaining = quantity; next.inventoryKeys = next.inventoryKeys.filter((key) => key !== outcome.targetKey || remaining-- <= 0) }
  if (outcome.kind === 'grant_token' || outcome.kind === 'unlock') { if (!next.tokenKeys.includes(outcome.targetKey)) next.tokenKeys.push(outcome.targetKey) }
  if (outcome.kind === 'remove_token') next.tokenKeys = next.tokenKeys.filter((key) => key !== outcome.targetKey)
  if (outcome.kind === 'grant_currency') next.currency[outcome.targetKey] = (next.currency[outcome.targetKey] ?? 0) + quantity
  if (outcome.kind === 'remove_currency') next.currency[outcome.targetKey] = Math.max(0, (next.currency[outcome.targetKey] ?? 0) - quantity)
  if (outcome.kind === 'set_state') next.state[outcome.targetKey] = outcome.value ?? true
  if (outcome.kind === 'clear_state') delete next.state[outcome.targetKey]
  if (outcome.kind === 'set_stat') next.stats[outcome.targetKey] = typeof outcome.value === 'number' ? outcome.value : quantity
  if (outcome.kind === 'increase_stat') next.stats[outcome.targetKey] = (next.stats[outcome.targetKey] ?? 0) + quantity
  if (outcome.kind === 'decrease_stat') next.stats[outcome.targetKey] = (next.stats[outcome.targetKey] ?? 0) - quantity
  if (outcome.kind === 'clamp_stat') next.stats[outcome.targetKey] = Math.max(typeof outcome.value === 'number' ? outcome.value : 0, Math.min(quantity, next.stats[outcome.targetKey] ?? 0))
  if (outcome.kind === 'travel_to') { next.currentLocationKey = outcome.targetKey; if (!next.visitedLocationKeys.includes(outcome.targetKey)) next.visitedLocationKeys.push(outcome.targetKey) }
  if (outcome.kind === 'branch_to') next.state.currentBranchKey = outcome.targetKey
  if (outcome.kind === 'set_current_dialogue') next.currentDialogueKey = outcome.targetKey
  if (outcome.kind === 'set_current_scene') next.currentSceneKey = outcome.targetKey
  return next
}

export type InteractiveChoice = { key: string; name: string; conditionKeys: string[]; outcomeKeys: string[]; branchesTo: string[] }
export type InteractiveManifest = {
  initialState: InteractiveRuntimeState
  conditions: Array<{ key: string; name: string; condition: InteractiveCondition }>
  outcomes: Array<{ key: string; name: string; outcome: InteractiveOutcome }>
  dialogueNodes: Array<{ key: string; name: string; choiceKeys: string[] }>
  choices: InteractiveChoice[]
  tradeOffers?: Array<{ key: string; offer: { gives: Array<{ key: string; quantity: number }>; receives: Array<{ key: string; quantity: number }>; currencyCost?: { currencyKey: string; amount: number } } }>
  travelLinks?: Array<{ key: string; travelsToKeys: string[] }>
}

export function getAvailableChoices(manifest: InteractiveManifest, state: InteractiveRuntimeState, dialogueKey: string) {
  const dialogue = manifest.dialogueNodes.find((node) => node.key === dialogueKey)
  const choices = dialogue ? manifest.choices.filter((choice) => dialogue.choiceKeys.includes(choice.key)) : []
  return choices.map((choice) => {
    const conditions = choice.conditionKeys.map((key) => manifest.conditions.find((condition) => condition.key === key)).filter(Boolean) as Array<{ key: string; name: string; condition: InteractiveCondition }>
    const failed = conditions.filter((condition) => !evaluateCondition(condition.condition, state))
    return { choice, available: failed.length === 0, lockedReasons: failed.map((condition) => condition.name) }
  })
}

export function applyChoice(manifest: InteractiveManifest, state: InteractiveRuntimeState, choiceKey: string) {
  const choice = manifest.choices.find((entry) => entry.key === choiceKey)
  if (!choice) return state
  const conditions = choice.conditionKeys.map((key) => manifest.conditions.find((condition) => condition.key === key)).filter(Boolean) as Array<{ condition: InteractiveCondition }>
  if (!conditions.every((condition) => evaluateCondition(condition.condition, state))) return state
  let next = state
  for (const outcomeKey of choice.outcomeKeys) {
    const outcome = manifest.outcomes.find((entry) => entry.key === outcomeKey)
    if (outcome) next = applyOutcome(outcome.outcome, next)
  }
  for (const branchKey of choice.branchesTo) {
    next = applyOutcome({ kind: 'branch_to', targetKey: branchKey }, next)
  }
  return next
}

export function executeTrade(manifest: InteractiveManifest, state: InteractiveRuntimeState, tradeOfferKey: string) {
  const trade = manifest.tradeOffers?.find((entry) => entry.key === tradeOfferKey)
  if (!trade) return state
  let next = state
  if (trade.offer.currencyCost) next = applyOutcome({ kind: 'remove_currency', targetKey: trade.offer.currencyCost.currencyKey, quantity: trade.offer.currencyCost.amount }, next)
  for (const item of trade.offer.receives) next = applyOutcome({ kind: 'remove_item', targetKey: item.key, quantity: item.quantity }, next)
  for (const item of trade.offer.gives) next = applyOutcome({ kind: 'grant_item', targetKey: item.key, quantity: item.quantity }, next)
  return next
}

export function moveToLocation(manifest: InteractiveManifest, state: InteractiveRuntimeState, travelLinkKey: string) {
  const destination = manifest.travelLinks?.find((entry) => entry.key === travelLinkKey)?.travelsToKeys[0]
  return destination ? applyOutcome({ kind: 'travel_to', targetKey: destination }, state) : state
}
`
}

function buildGeneratedInteractiveAdapterSource() {
  return `import { applyOutcome, evaluateCondition, type InteractiveCondition, type InteractiveOutcome, type InteractiveRuntimeState } from './InteractiveRuntime'

export type InteractiveRuntimeAdapter = {
  getState(): Promise<InteractiveRuntimeState>
  setState(state: InteractiveRuntimeState): Promise<void>
  evaluate(condition: InteractiveCondition): Promise<boolean>
  apply(outcome: InteractiveOutcome): Promise<InteractiveRuntimeState>
}

export function createMockInteractiveAdapter(initialState?: Partial<InteractiveRuntimeState>): InteractiveRuntimeAdapter {
  let state: InteractiveRuntimeState = {
    inventoryKeys: [],
    currency: {},
    tokenKeys: [],
    stats: {},
    state: {},
    currentLocationKey: null,
    currentSpotKey: null,
    currentSceneKey: null,
    currentDialogueKey: null,
    visitedLocationKeys: [],
    ...initialState,
  }
  return {
    async getState() { return state },
    async setState(nextState) { state = nextState },
    async evaluate(condition) { return evaluateCondition(condition, state) },
    async apply(outcome) { state = applyOutcome(outcome, state); return state },
  }
}
`
}

export function buildAppGeneratedFileDrafts(input: {
  projectName?: string
  draftMetadata?: Record<string, unknown>
  entities: WorldEntity[]
  relationships?: WorldRelationship[]
}): AppGeneratedFileDraft[] {
  const worldWiki = readWorldWikiMetadata(input.draftMetadata)
  const colorScheme = asRecord(worldWiki.colorScheme)
  const plan = buildRecommendedAppCodeFilePlan(input.entities)
  const screens = input.entities.filter((entity) => entity.nodeType === 'screen')
  const appNode = input.entities.find((entity) => entity.nodeType === 'app')
  const appName = appNode?.name || input.projectName || 'Generated App'
  const previewHtml = buildAppSandboxPreviewHtml(input)
  const drafts: AppGeneratedFileDraft[] = []

  for (const file of plan.files) {
    let content = ''
    if (file.path === 'package.json') {
      content = `${JSON.stringify({
        scripts: {
          start: 'expo start',
          web: 'expo start --web',
          typecheck: 'tsc --noEmit',
        },
        dependencies: {
          expo: 'latest',
          'expo-router': 'latest',
          react: 'latest',
          'react-native': 'latest',
          'react-native-web': 'latest',
        },
        devDependencies: {
          typescript: 'latest',
        },
      }, null, 2)}\n`
    } else if (file.path === 'app.json') {
      content = `${JSON.stringify({ expo: { name: appName, slug: appName.toLowerCase().replace(/[^a-z0-9]+/g, '-'), scheme: 'generatedapp', platforms: ['ios', 'web'] } }, null, 2)}\n`
    } else if (file.path === 'eas.json') {
      content = `${JSON.stringify({ cli: { version: '>= 12.0.0' }, build: { production: {} } }, null, 2)}\n`
    } else if (file.path === '.env.example') {
      content = 'EXPO_PUBLIC_GRAPHCORE_APP_ID=\nEXPO_PUBLIC_BACKEND_MODE=mock\n'
    } else if (file.path === 'README.md') {
      content = `# ${appName}\n\nGenerated from the GraphCore App Graph.\n\n## Preview\n\n\`\`\`bash\nnpm install\nnpx expo start --web\n\`\`\`\n`
    } else if (file.path === 'app/_layout.tsx') {
      content = "import { Stack } from 'expo-router'\n\nexport default function RootLayout() {\n  return <Stack screenOptions={{ headerShown: false }} />\n}\n"
    } else if (file.path === 'types/appGraph.ts') {
      content = "export type AppEntity = { id: string; type: string; name: string; properties: Record<string, unknown> }\nexport type AppActionResult = { ok: boolean; data?: unknown; error?: string }\n"
    } else if (file.path === 'types/models.ts') {
      content = "export type UserProfile = { id: string; displayName: string }\nexport type GeneratedResult = { id: string; title: string; summary: string; createdAt: string }\n"
    } else if (file.path === 'lib/backend/AppBackend.ts') {
      content = "export interface AppBackend {\n  getEntities(type: string): Promise<unknown[]>\n  createEntity(type: string, data: unknown): Promise<unknown>\n  runAction(actionId: string, input: unknown): Promise<unknown>\n}\n"
    } else if (file.path === 'lib/backend/LocalMockBackendAdapter.ts') {
      content = "import type { AppBackend } from './AppBackend'\n\nexport class LocalMockBackendAdapter implements AppBackend {\n  async getEntities() { return [] }\n  async createEntity(_type: string, data: unknown) { return { id: crypto.randomUUID(), data } }\n  async runAction(actionId: string, input: unknown) { return { actionId, input, mocked: true } }\n}\n"
    } else if (file.path === 'lib/backend/ManagedBackendAdapter.ts') {
      content = "import type { AppBackend } from './AppBackend'\n\nexport class ManagedBackendAdapter implements AppBackend {\n  async getEntities() { throw new Error('Managed backend is not configured yet.') }\n  async createEntity() { throw new Error('Managed backend is not configured yet.') }\n  async runAction() { throw new Error('Managed backend is not configured yet.') }\n}\n"
    } else if (file.path === 'lib/actions.ts') {
      content = "import type { AppBackend } from './backend/AppBackend'\n\nexport function runAppAction(backend: AppBackend, actionId: string, input: unknown) {\n  return backend.runAction(actionId, input)\n}\n"
    } else if (file.path === 'lib/contracts/routes.ts') {
      content = `export const routeManifest = ${JSON.stringify(screens.map((screen) => ({
        key: screen.key,
        name: screen.name,
        route: routeForScreen(screen),
      })), null, 2)} as const\n`
    } else if (file.path === 'lib/contracts/actions.ts') {
      const actions = input.entities.filter((entity) => entity.nodeType === 'action').map((action) => ({
        key: action.key,
        name: action.name,
        input: entityValue(action, 'input') ?? {},
        output: entityValue(action, 'output') ?? {},
        sideEffects: arrayValue(action, 'sideEffects'),
      }))
      content = `export const actionContracts = ${JSON.stringify(actions, null, 2)} as const\n`
    } else if (file.path === 'lib/capabilities/CapabilityAdapters.ts') {
      content = "export type CapabilityResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string }\n\nexport interface CameraAdapter {\n  pickImage(): Promise<CapabilityResult<{ uri: string }>>\n}\n\nexport interface HealthAdapter {\n  getDailySteps(): Promise<CapabilityResult<{ steps: number }>>\n}\n\nexport interface PushAdapter {\n  requestPermission(): Promise<CapabilityResult<{ granted: boolean }>>\n  scheduleLocalNotification(input: { title: string; body: string }): Promise<CapabilityResult<{ id: string }>>\n}\n\nexport interface CapabilityAdapters {\n  camera: CameraAdapter\n  health: HealthAdapter\n  push: PushAdapter\n}\n"
    } else if (file.path === 'lib/capabilities/MockCapabilityAdapters.ts') {
      content = "import type { CapabilityAdapters } from './CapabilityAdapters'\n\nexport const mockCapabilityAdapters: CapabilityAdapters = {\n  camera: {\n    async pickImage() { return { ok: true, data: { uri: 'mock://image' } } },\n  },\n  health: {\n    async getDailySteps() { return { ok: true, data: { steps: 6420 } } },\n  },\n  push: {\n    async requestPermission() { return { ok: true, data: { granted: true } } },\n    async scheduleLocalNotification() { return { ok: true, data: { id: 'mock-notification' } } },\n  },\n}\n"
    } else if (file.path === 'lib/payments/PaymentAdapter.ts') {
      content = "export type SubscriptionState = { active: boolean; plan: 'free' | 'pro' | 'premium' }\n\nexport interface PaymentAdapter {\n  getSubscriptionState(): Promise<SubscriptionState>\n  presentPaywall(trigger: string): Promise<SubscriptionState>\n}\n\nexport const mockPaymentAdapter: PaymentAdapter = {\n  async getSubscriptionState() { return { active: false, plan: 'free' } },\n  async presentPaywall() { return { active: true, plan: 'pro' } },\n}\n"
    } else if (file.path === 'lib/ai/AiGenerationAdapter.ts') {
      content = "export interface AiGenerationAdapter {\n  generate(input: { actionId: string; prompt: string; data?: unknown }): Promise<{ title: string; summary: string; payload: unknown }>\n}\n\nexport const mockAiGenerationAdapter: AiGenerationAdapter = {\n  async generate(input) {\n    return { title: 'Mock result', summary: `Generated preview for ${input.actionId}.`, payload: { mocked: true, input } }\n  },\n}\n"
    } else if (file.path === 'lib/auth/AuthAdapter.ts') {
      content = "export type AppUser = { id: string; displayName: string; anonymous: boolean }\n\nexport interface AuthAdapter {\n  getCurrentUser(): Promise<AppUser>\n  signInAnonymously(): Promise<AppUser>\n}\n\nexport const mockAuthAdapter: AuthAdapter = {\n  async getCurrentUser() { return { id: 'preview-user', displayName: 'Preview User', anonymous: true } },\n  async signInAnonymously() { return { id: 'preview-user', displayName: 'Preview User', anonymous: true } },\n}\n"
    } else if (file.path === 'lib/interactive/InteractiveRuntime.ts') {
      content = "export type InteractiveRuntimeState = {\n  inventoryKeys: string[]\n  currency: Record<string, number>\n  tokenKeys: string[]\n  state: Record<string, unknown>\n  currentLocationKey: string | null\n  currentSpotKey: string | null\n  visitedLocationKeys: string[]\n}\n\nexport type InteractiveCondition = {\n  kind: 'has_item' | 'has_token' | 'has_currency' | 'state_equals' | 'visited_location'\n  targetKey: string\n  operator?: 'eq' | 'neq' | 'gte' | 'lte' | 'gt' | 'lt' | 'exists' | 'missing'\n  value?: string | number | boolean\n  quantity?: number\n}\n\nexport type InteractiveOutcome = {\n  kind: 'grant_item' | 'remove_item' | 'grant_token' | 'remove_token' | 'remove_currency' | 'grant_currency' | 'set_state' | 'unlock' | 'travel_to' | 'branch_to'\n  targetKey: string\n  value?: string | number | boolean\n  quantity?: number\n}\n\nfunction compare(left: unknown, operator: InteractiveCondition['operator'] = 'exists', right: unknown) {\n  if (operator === 'exists') return left !== undefined && left !== null && left !== false\n  if (operator === 'missing') return left === undefined || left === null || left === false\n  if (operator === 'eq') return left === right\n  if (operator === 'neq') return left !== right\n  if (typeof left !== 'number' || typeof right !== 'number') return false\n  if (operator === 'gte') return left >= right\n  if (operator === 'lte') return left <= right\n  if (operator === 'gt') return left > right\n  if (operator === 'lt') return left < right\n  return false\n}\n\nexport function evaluateCondition(condition: InteractiveCondition, state: InteractiveRuntimeState) {\n  const quantity = condition.quantity ?? 1\n  if (condition.kind === 'has_item') return compare(state.inventoryKeys.filter((key) => key === condition.targetKey).length, condition.operator === 'exists' ? 'gte' : condition.operator, condition.value ?? quantity)\n  if (condition.kind === 'has_token') return compare(state.tokenKeys.includes(condition.targetKey), condition.operator, condition.value ?? true)\n  if (condition.kind === 'has_currency') return compare(state.currency[condition.targetKey] ?? 0, condition.operator === 'exists' ? 'gte' : condition.operator, condition.value ?? quantity)\n  if (condition.kind === 'state_equals') return compare(state.state[condition.targetKey], condition.operator, condition.value)\n  if (condition.kind === 'visited_location') return compare(state.visitedLocationKeys.includes(condition.targetKey), condition.operator, condition.value ?? true)\n  return false\n}\n\nexport function applyOutcome(outcome: InteractiveOutcome, state: InteractiveRuntimeState): InteractiveRuntimeState {\n  const quantity = outcome.quantity ?? 1\n  const next: InteractiveRuntimeState = { ...state, inventoryKeys: [...state.inventoryKeys], tokenKeys: [...state.tokenKeys], currency: { ...state.currency }, state: { ...state.state }, visitedLocationKeys: [...state.visitedLocationKeys] }\n  if (outcome.kind === 'grant_item') next.inventoryKeys.push(...Array.from({ length: quantity }, () => outcome.targetKey))\n  if (outcome.kind === 'remove_item') {\n    let remaining = quantity\n    next.inventoryKeys = next.inventoryKeys.filter((key) => key !== outcome.targetKey || remaining-- <= 0)\n  }\n  if (outcome.kind === 'grant_token' || outcome.kind === 'unlock') {\n    if (!next.tokenKeys.includes(outcome.targetKey)) next.tokenKeys.push(outcome.targetKey)\n  }\n  if (outcome.kind === 'remove_token') next.tokenKeys = next.tokenKeys.filter((key) => key !== outcome.targetKey)\n  if (outcome.kind === 'grant_currency') next.currency[outcome.targetKey] = (next.currency[outcome.targetKey] ?? 0) + quantity\n  if (outcome.kind === 'remove_currency') next.currency[outcome.targetKey] = Math.max(0, (next.currency[outcome.targetKey] ?? 0) - quantity)\n  if (outcome.kind === 'set_state') next.state[outcome.targetKey] = outcome.value ?? true\n  if (outcome.kind === 'travel_to') {\n    next.currentLocationKey = outcome.targetKey\n    if (!next.visitedLocationKeys.includes(outcome.targetKey)) next.visitedLocationKeys.push(outcome.targetKey)\n  }\n  if (outcome.kind === 'branch_to') next.state.currentBranchKey = outcome.targetKey\n  return next\n}\n"
    } else if (file.path === 'lib/interactive/MockInteractiveAdapters.ts') {
      content = "import { applyOutcome, evaluateCondition, type InteractiveCondition, type InteractiveOutcome, type InteractiveRuntimeState } from './InteractiveRuntime'\n\nexport type InteractiveRuntimeAdapter = {\n  getState(): Promise<InteractiveRuntimeState>\n  setState(state: InteractiveRuntimeState): Promise<void>\n  evaluate(condition: InteractiveCondition): Promise<boolean>\n  apply(outcome: InteractiveOutcome): Promise<InteractiveRuntimeState>\n}\n\nexport function createMockInteractiveAdapter(initialState?: Partial<InteractiveRuntimeState>): InteractiveRuntimeAdapter {\n  let state: InteractiveRuntimeState = {\n    inventoryKeys: [],\n    currency: {},\n    tokenKeys: [],\n    state: {},\n    currentLocationKey: null,\n    currentSpotKey: null,\n    visitedLocationKeys: [],\n    ...initialState,\n  }\n  return {\n    async getState() { return state },\n    async setState(nextState) { state = nextState },\n    async evaluate(condition) { return evaluateCondition(condition, state) },\n    async apply(outcome) { state = applyOutcome(outcome, state); return state },\n  }\n}\n"
    } else if (file.path === 'lib/capabilities/mockCapabilities.ts') {
      content = "export const mockCapabilities = {\n  camera: { webPreview: 'file upload fallback' },\n  payments: { webPreview: 'mock subscription state' },\n  notifications: { webPreview: 'simulated notifications' },\n}\n"
    } else if (file.path === 'lib/design/tokens.ts') {
      content = `export const designTokens = ${JSON.stringify({
        color: {
          primary: cssColor(colorScheme.primary, '#2563eb'),
          secondary: cssColor(colorScheme.secondary, '#14b8a6'),
          tertiary: cssColor(colorScheme.tertiary, '#f8fafc'),
        },
        radius: { card: 24, control: 999 },
        spacing: { page: 24, section: 18 },
      }, null, 2)} as const\n`
    } else if (file.path === 'app/index.tsx') {
      const home = screens.find((screen) => routeFilePathForScreen(screen) === 'app/index.tsx') ?? screens[0] ?? entityFallback('home', 'Home Screen', 'Start the app flow.')
      content = buildReactNativeScreenFile(home, colorScheme)
    } else if (file.path.startsWith('app/')) {
      const screen = screens.find((candidate) => routeFilePathForScreen(candidate) === file.path)
      content = screen ? buildReactNativeScreenFile(screen, colorScheme) : ''
    } else if (file.path.startsWith('components/')) {
      const componentName = pascalCase(file.path)
      content = `import { StyleSheet, Text, View } from 'react-native'\n\nexport function ${componentName}() {\n  return (\n    <View style={styles.container}>\n      <Text style={styles.label}>${componentName}</Text>\n    </View>\n  )\n}\n\nconst styles = StyleSheet.create({\n  container: { padding: 16, borderRadius: 20, backgroundColor: '#fff' },\n  label: { fontSize: 15, fontWeight: '700', color: '#0f172a' },\n})\n`
    }

    if (file.path === 'lib/interactive/InteractiveRuntime.ts') {
      content = buildGeneratedInteractiveRuntimeSource()
    } else if (file.path === 'lib/interactive/MockInteractiveAdapters.ts') {
      content = buildGeneratedInteractiveAdapterSource()
    } else if (file.path === 'lib/interactive/interactiveManifest.ts') {
      content = `export const interactiveManifest = ${JSON.stringify(compileInteractiveManifest({
        entities: input.entities,
        relationships: input.relationships ?? [],
      }), null, 2)} as const\n`
    }

    drafts.push(appGeneratedFileDraftSchema.parse({
      path: file.path,
      kind: inferFileKind(file.path),
      ownerTower: file.ownerTower,
      content,
      exports: file.exports,
      imports: file.imports,
      metadata: {
        status: file.status,
        validationErrors: file.validationErrors,
      },
    }))
  }

  drafts.push(appGeneratedFileDraftSchema.parse({
    path: 'preview/sandbox.html',
    kind: 'asset',
    ownerTower: 'preview',
    content: previewHtml,
    exports: [],
    imports: [],
    metadata: { previewRole: 'sandbox_html' },
  }))

  return drafts
}

export function buildRecommendedAppCodeFilePlan(entities: WorldEntity[]) {
  const appEntities = entities.filter((entity) => isAppGraphNodeType(entity.nodeType))
  const appAndInteractiveEntities = entities.filter((entity) => isAppGraphNodeType(entity.nodeType) || isInteractiveSystemNodeType(entity.nodeType))
  const extraFiles = new Map<string, z.infer<typeof appCodeFilePlanSchema>>()

  for (const screen of appEntities.filter((entity) => entity.nodeType === 'screen')) {
    const routeName = pathSafeName(screen)
    const path = routeName === 'index' || routeName === 'home' ? 'app/index.tsx' : `app/${routeName}.tsx`
    extraFiles.set(path, appCodeFilePlanSchema.parse({
      path,
      ownerTower: textValue(screen, 'ownerTower') || 'screen_tower',
      exports: [`${pascalCase(routeName)}Screen`],
      imports: ['View', 'Text', 'Pressable'],
      status: 'planned',
    }))
  }

  for (const component of appEntities.filter((entity) => entity.nodeType === 'component')) {
    const existingPath = textValue(component, 'filePath')
    const componentName = pascalCase(existingPath || component.name || component.key)
    const path = existingPath || `components/${componentName}.tsx`
    extraFiles.set(path, appCodeFilePlanSchema.parse({
      path,
      ownerTower: textValue(component, 'ownerTower') || 'component_tower',
      exports: [componentName],
      imports: ['View', 'Text'],
      status: 'planned',
    }))
  }

  if (appEntities.some((entity) => entity.nodeType === 'data_model')) {
    extraFiles.set('types/models.ts', appCodeFilePlanSchema.parse({
      path: 'types/models.ts',
      ownerTower: 'shared_contracts',
      exports: ['AppModels'],
      imports: [],
      status: 'planned',
    }))
  }

  if (appEntities.some((entity) => entity.nodeType === 'api_endpoint' || entity.nodeType === 'action')) {
    extraFiles.set('lib/actions.ts', appCodeFilePlanSchema.parse({
      path: 'lib/actions.ts',
      ownerTower: 'backend',
      exports: ['runAppAction'],
      imports: ['AppBackend'],
      status: 'planned',
    }))
  }

  if (appEntities.some((entity) => entity.nodeType === 'capability')) {
    extraFiles.set('lib/capabilities/mockCapabilities.ts', appCodeFilePlanSchema.parse({
      path: 'lib/capabilities/mockCapabilities.ts',
      ownerTower: 'capabilities',
      exports: ['mockCapabilities'],
      imports: [],
      status: 'planned',
    }))
  }

  if (collectInteractiveSystemRequirements({ entities: appAndInteractiveEntities }).length > 0 || appAndInteractiveEntities.some((entity) => isInteractiveSystemNodeType(entity.nodeType))) {
    extraFiles.set('lib/interactive/InteractiveRuntime.ts', appCodeFilePlanSchema.parse({
      path: 'lib/interactive/InteractiveRuntime.ts',
      ownerTower: 'interactive_systems',
      exports: ['InteractiveRuntimeState', 'InteractiveCondition', 'InteractiveOutcome', 'createInitialRuntimeState', 'getAvailableChoices', 'evaluateCondition', 'applyOutcome', 'applyChoice', 'executeTrade', 'moveToLocation'],
      imports: [],
      status: 'planned',
    }))
    extraFiles.set('lib/interactive/MockInteractiveAdapters.ts', appCodeFilePlanSchema.parse({
      path: 'lib/interactive/MockInteractiveAdapters.ts',
      ownerTower: 'interactive_systems',
      exports: ['InteractiveRuntimeAdapter', 'createMockInteractiveAdapter'],
      imports: ['InteractiveRuntime'],
      status: 'planned',
    }))
    extraFiles.set('lib/interactive/interactiveManifest.ts', appCodeFilePlanSchema.parse({
      path: 'lib/interactive/interactiveManifest.ts',
      ownerTower: 'interactive_systems',
      exports: ['interactiveManifest'],
      imports: [],
      status: 'planned',
    }))
  }

  extraFiles.set('lib/design/tokens.ts', appCodeFilePlanSchema.parse({
    path: 'lib/design/tokens.ts',
    ownerTower: 'design_system',
    exports: ['designTokens'],
    imports: [],
    status: 'planned',
  }))

  const basePaths = new Set(APP_EXPO_BASE_FILE_PLAN.map((file) => file.path))
  return createDefaultAppCodegenProjectPlan(
    [...extraFiles.values()].filter((file) => !basePaths.has(file.path)),
  )
}

export function appGenerationJobIsTerminal(job: Pick<AppGenerationJob, 'status'>): boolean {
  return ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)
}
