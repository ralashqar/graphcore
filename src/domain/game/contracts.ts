import { z } from 'zod'

export const GAME_TEMPLATE = 'adventure.v1' as const
export const GAME_RUNTIME_VERSION = '1.0.0'
const key = z.string().regex(/^[a-z][a-zA-Z0-9_.-]{0,95}$/)
const text = z.string().trim().min(1).max(2000)
export const vectorSchema = z.object({ x: z.number().finite(), y: z.number().finite(), z: z.number().finite() }).strict()
const color = z.string().regex(/^#[0-9a-f]{6}$/i)
export const systemKeys = ['movement', 'interaction', 'inventory', 'dialogue', 'quest', 'presentation', 'persistence'] as const
export const systemKeySchema = z.enum(systemKeys)
export const portSchema = z.object({ name: key, schema: key, direction: z.enum(['input', 'output']) }).strict()
export const systemSpecSchema = z.object({
  key: systemKeySchema, version: z.literal(1), module: key, label: text,
  owns: z.array(key), ports: z.array(portSchema), dependencies: z.array(systemKeySchema),
  acceptance: z.array(text).min(1),
}).strict()
export const assetRecipeSchema = z.object({
  key, entityKey: z.string().max(128).nullable(), subject: text,
  revision: z.number().int().positive(), styleVersion: z.number().int().positive(),
  method: z.enum(['procedural', 'image_to_3d', 'approved_rig']),
  prompt: text, sourceImageAssetKey: z.string().max(128).nullable(),
  dimensions: vectorSchema, maxTriangles: z.number().int().min(100).max(100000),
  maxBytes: z.number().int().min(1024).max(32000000),
}).strict()
export const prefabSchema = z.object({
  key, entityKey: z.string().max(128).nullable(), label: text,
  role: z.enum(['player', 'npc', 'key', 'door', 'goal', 'prop', 'wall']),
  assetRecipeKey: key.nullable(), size: vectorSchema, color,
  collider: z.enum(['none', 'box', 'capsule']),
}).strict()
export const levelSchema = z.object({
  key, name: text, seed: z.number().int().nonnegative(), units: z.literal('meters'),
  width: z.number().min(12).max(80), depth: z.number().min(12).max(80), spawn: vectorSchema,
  instances: z.array(z.object({ key, prefabKey: key, position: vectorSchema, rotationY: z.number().finite() }).strict()).min(4).max(200),
}).strict()
export const gameDesignSchema = z.object({
  schemaVersion: z.literal(1), template: z.literal(GAME_TEMPLATE), title: text, brief: text,
  coreLoop: z.array(text).min(3).max(8), unsupportedMechanics: z.array(text).max(12),
  sourceEntityKeys: z.array(z.string().max(128)).max(100),
  style: z.object({ version: z.number().int().positive(), description: text, ground: color, accent: color, sky: color }).strict(),
  target: z.literal('desktop_web'), engine: z.literal('babylon'),
  movement: z.object({ walkSpeed: z.number().min(1).max(8), sprintSpeed: z.number().min(1).max(12), staminaDrain: z.number().min(0).max(40), staminaRecovery: z.number().min(1).max(40) }).strict(),
  inventory: z.object({ capacity: z.number().int().min(1).max(50), keyItem: key }).strict(),
  dialogue: z.object({ greeting: text, afterKey: text, afterComplete: text }).strict(),
  quest: z.object({ title: text, objective: text, completionText: text }).strict(),
  systems: z.array(systemSpecSchema).length(7), prefabs: z.array(prefabSchema).min(5).max(40),
  level: levelSchema, assets: z.array(assetRecipeSchema).max(40),
}).strict()
export type GameDesignSpec = z.infer<typeof gameDesignSchema>
export type SystemSpec = z.infer<typeof systemSpecSchema>
export type AssetRecipe = z.infer<typeof assetRecipeSchema>
export type Vector = z.infer<typeof vectorSchema>
export type PrefabSpec = z.infer<typeof prefabSchema>

export const artifactSchema = z.object({
  recipeKey: key, revisionId: z.string().uuid(), sourceHash: z.string().length(64),
  storagePath: z.string().min(1), sha256: z.string().length(64), bytes: z.number().int().positive(),
  triangles: z.number().int().nonnegative(), dimensions: vectorSchema,
  reports: z.array(text),
}).strict()
export const buildManifestSchema = z.object({
  schemaVersion: z.literal(1), id: z.string().uuid(), projectId: z.string().uuid(), draftId: z.string().uuid(),
  sourceRevision: z.number().int().positive(), sourceHash: z.string().length(64),
  runtimeVersion: z.literal(GAME_RUNTIME_VERSION), templateVersion: z.literal(GAME_TEMPLATE),
  toolchain: z.object({ compiler: z.literal('game-compiler.v1'), babylon: z.literal('9.25.0'), blender: z.literal('5.0.1'), playwright: z.literal('1.63.0') }).default({ compiler: 'game-compiler.v1', babylon: '9.25.0', blender: '5.0.1', playwright: '1.63.0' }),
  design: gameDesignSchema, assets: z.array(artifactSchema),
  nodeHashes: z.record(z.string(), z.string().length(64)),
}).strict()
export type GameBuildManifest = z.infer<typeof buildManifestSchema>
export type GameArtifact = z.infer<typeof artifactSchema>

export const gameCommandSchema = z.object({
  projectId: z.string().uuid(), draftId: z.string().uuid(), idempotencyKey: z.string().uuid(),
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum(['generate', 'save', 'build', 'asset', 'cancel', 'publish', 'retry']),
  prompt: z.string().trim().min(1).max(8000).optional(),
  design: gameDesignSchema.optional(), jobId: z.string().uuid().optional(), buildId: z.string().uuid().optional(), recipeKey: key.optional(),
}).strict().superRefine((value, ctx) => {
  const required = ({ generate: 'prompt', save: 'design', cancel: 'jobId', retry: 'jobId', publish: 'buildId', asset: 'recipeKey', build: undefined } as const)[value.action]
  if (required && !value[required]) ctx.addIssue({ code: 'custom', message: `${required} is required for ${value.action}`, path: [required] })
})
export type GameCommand = z.infer<typeof gameCommandSchema>
export const jobSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['generate', 'build', 'asset']), status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'attention']),
  phase: z.string(), error: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
  recipe_key: z.string().nullable().optional(), source_revision: z.union([z.string(), z.number()]).nullable().optional(),
  progress: z.array(z.object({ key: z.string(), label: z.string(), status: z.string(), detail: z.string().optional() })),
})
export const workspaceSchema = z.object({
  revision: z.number().int().nonnegative(), design: gameDesignSchema.nullable(), activeBuildId: z.string().uuid().nullable(),
  jobs: z.array(jobSchema), builds: z.array(z.object({ id: z.string().uuid(), source_revision: z.number(), status: z.string(), created_at: z.string(), reports: z.array(z.record(z.string(), z.unknown())) })),
  assets: z.array(artifactSchema),
  pricing: z.object({ planCredits: z.number().int().nonnegative(), assetCredits: z.number().int().nonnegative() }).nullable().default(null),
})
export type GameWorkspace = z.infer<typeof workspaceSchema>
