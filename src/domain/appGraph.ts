import { z } from 'zod'

export const appGraphNodeTypeSchema = z.enum([
  'app',
  'persona',
  'business_goal',
  'feature',
  'user_flow',
  'screen',
  'section',
  'component',
  'data_model',
  'action',
  'api_endpoint',
  'backend_function',
  'external_service',
  'design_system',
  'capability',
  'screen_mockup',
  'image_region',
  'animation_spec',
  'tower',
  'code_file',
])

export const appGraphEdgeVerbSchema = z.enum([
  'contains',
  'uses',
  'reads',
  'writes',
  'creates',
  'updates',
  'deletes',
  'calls',
  'invokes',
  'emits',
  'transitions_to',
  'requires_auth',
  'gated_by',
  'styled_by',
  'represented_by',
  'implemented_as',
  'tested_by',
  'depends_on',
  'owned_by_tower',
  'requires_capability',
])

export const appCapabilitySupportSchema = z.enum(['supported', 'mocked', 'limited', 'requires_dev_build', 'unsupported'])

export const appCapabilityRuleSchema = z.object({
  capability: z.string().min(1),
  webPreview: appCapabilitySupportSchema.default('mocked'),
  expoGo: appCapabilitySupportSchema.default('limited'),
  requiresDevBuild: z.boolean().default(false),
  requiresAppleDeveloper: z.boolean().default(false),
  productionNote: z.string().default(''),
})

export const appNodePropertiesSchema = z.object({
  role: z.string().default(''),
  route: z.string().default(''),
  purpose: z.string().default(''),
  platformTargets: z.array(z.string()).default([]),
  monetization: z.string().default(''),
  coreLoop: z.string().default(''),
  emotionalBeat: z.string().default(''),
  conversionRole: z.string().default(''),
  states: z.array(z.string()).default([]),
  props: z.record(z.string(), z.unknown()).default({}),
  fields: z.array(z.record(z.string(), z.unknown())).default([]),
  validationRules: z.array(z.string()).default([]),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
  capabilityRule: appCapabilityRuleSchema.optional(),
  filePath: z.string().default(''),
  ownerTower: z.string().default(''),
}).partial()

export const appTowerTaskSchema = z.object({
  task: z.string().min(1),
  ownedNodes: z.array(z.string()).default([]),
  relevantEdges: z.array(z.string()).default([]),
  sharedContracts: z.array(z.string()).default([]),
  designTokens: z.record(z.string(), z.unknown()).default({}),
  screenMockups: z.array(z.string()).default([]),
  allowedFiles: z.array(z.string()).default([]),
  forbiddenFiles: z.array(z.string()).default([]),
})

export const APP_GRAPH_NODE_TYPES = appGraphNodeTypeSchema.options
export const APP_GRAPH_EDGE_VERBS = appGraphEdgeVerbSchema.options

export type AppGraphNodeType = z.infer<typeof appGraphNodeTypeSchema>
export type AppGraphEdgeVerb = z.infer<typeof appGraphEdgeVerbSchema>
export type AppCapabilityRule = z.infer<typeof appCapabilityRuleSchema>
export type AppNodeProperties = z.infer<typeof appNodePropertiesSchema>
export type AppTowerTask = z.infer<typeof appTowerTaskSchema>

export function isAppGraphNodeType(value: string): value is AppGraphNodeType {
  return appGraphNodeTypeSchema.safeParse(value).success
}

export function defaultCapabilityRule(capability: string): AppCapabilityRule {
  const normalized = capability.trim().toLowerCase()
  if (normalized.includes('health') || normalized.includes('iap') || normalized.includes('purchase')) {
    return {
      capability,
      webPreview: 'mocked',
      expoGo: 'unsupported',
      requiresDevBuild: true,
      requiresAppleDeveloper: true,
      productionNote: 'Requires a custom development build and production entitlement setup.',
    }
  }
  if (normalized.includes('push') || normalized.includes('notification')) {
    return {
      capability,
      webPreview: 'mocked',
      expoGo: 'limited',
      requiresDevBuild: true,
      requiresAppleDeveloper: false,
      productionNote: 'Use simulated notifications in web preview and configure production credentials later.',
    }
  }
  if (normalized.includes('camera') || normalized.includes('photo')) {
    return {
      capability,
      webPreview: 'mocked',
      expoGo: 'supported',
      requiresDevBuild: false,
      requiresAppleDeveloper: false,
      productionNote: 'Use file upload fallback in web preview and Expo-compatible APIs on device.',
    }
  }
  return {
    capability,
    webPreview: 'supported',
    expoGo: 'supported',
    requiresDevBuild: false,
    requiresAppleDeveloper: false,
    productionNote: '',
  }
}
