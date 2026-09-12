import { z } from 'zod'

export const directorReferenceSchema = z.object({
  assetKey: z.string().min(1), label: z.string(), kind: z.enum(['image', 'video', 'audio']),
  width: z.number().optional(), height: z.number().optional(), durationSeconds: z.number().optional(),
})
export const directorResolutions = ['480p', '768p', '1080p'] as const
export const directorAspectRatios = ['16:9', '9:16', '1:1', '21:9', '4:3', '3:4', 'adaptive'] as const
export const directorSettingsSchema = z.object({
  speed: z.enum(['standard', 'turbo']).default('standard'),
  resolution: z.enum(directorResolutions).default('768p'),
  /** `adaptive` lets reference-to-video pick the ratio from the references; text-to-video needs a fixed ratio. */
  aspectRatio: z.enum(directorAspectRatios).default('16:9'),
  durationSeconds: z.number().min(1).max(15).default(5),
  mode: z.enum(['scripted', 'explore']).default('scripted'),
  /** fal prompt expansion: `balanced` returns in about a second, `quality` spends up to ~30 s refining the prompt. */
  promptExpansion: z.enum(['balanced', 'quality']).default('balanced'),
  firstFrameAssetKey: z.string().default(''), endFrameAssetKey: z.string().default(''),
})
export const directorContextSchema = z.object({
  revision: z.string(), script: z.string().default(''), artDirection: z.string().default(''),
  entities: z.array(z.object({ key: z.string(), name: z.string(), summary: z.string(), visual: z.string(), voice: z.string() })).default([]),
  references: z.array(directorReferenceSchema).default([]),
  continuity: z.string().default(''),
})
export const directorClipSchema = z.object({
  id: z.string().min(1), takeId: z.string().uuid(), inSeconds: z.number().nonnegative(), outSeconds: z.number().positive(),
}).refine(c => c.outSeconds > c.inSeconds, 'Clip end must follow its start.')
export const directorSessionSchema = z.object({
  id: z.string().uuid(), project_id: z.string(), draft_id: z.string(), title: z.string(),
  source: z.record(z.string(), z.unknown()).default({}), settings: directorSettingsSchema,
  direction: z.string().default(''), entity_keys: z.array(z.string()).default([]),
  revision: z.number(), active_edit_id: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
})
export const directorTakeSchema = z.object({
  id: z.string().uuid(), session_id: z.string(), project_id: z.string(), draft_id: z.string(),
  status: z.enum(['queued', 'preparing', 'generating', 'saving', 'completed', 'failed', 'cancelled']),
  review: z.enum(['candidate', 'kept', 'rejected']), prompt: z.string(), settings: directorSettingsSchema,
  context: directorContextSchema, parent_take_id: z.string().nullable(), branch_seconds: z.number().nullable(),
  branch_mode: z.enum(['frame', 'motion']).default('frame'), base_edit_id: z.string().nullable(),
  asset_key: z.string().nullable(), duration_seconds: z.number().nullable(), run_id: z.string().nullable(),
  provider_request_id: z.string().nullable(), estimated_cost_usd: z.number().default(0),
  credits_reserved: z.number().default(0), credits_charged: z.number().nullable().default(null), credits_settled: z.boolean().default(false),
  pricing_snapshot: z.record(z.string(),z.unknown()).default({}),
  error_message: z.string().nullable(), created_at: z.string(), updated_at: z.string(),
})
export const directorEditSchema = z.object({
  id: z.string(), session_id: z.string(), parent_id: z.string().nullable(), clips: z.array(directorClipSchema), created_at: z.string(),
})
export const directorMessageSchema = z.object({ id: z.string(), role: z.enum(['user', 'assistant', 'system']), text: z.string(), created_at: z.string() })
export const directorExportSchema = z.object({ id: z.string(), status: z.string(), outputs: z.record(z.string(), z.unknown()), error_message: z.string().nullable() })
export const directorJobSchema = z.object({ run_id: z.string(), take_id: z.string().nullable(), phase: z.string(), error_message: z.string().nullable() })
export const directorStateSchema = z.object({
  sessions: z.array(directorSessionSchema), session: directorSessionSchema.nullable(), takes: z.array(directorTakeSchema),
  edits: z.array(directorEditSchema), messages: z.array(directorMessageSchema),
  nextCursor: z.string().nullable().default(null), exports: z.array(directorExportSchema).default([]),
  jobs: z.array(directorJobSchema).default([]),
})
/** Coalesced progress read: partial take rows keyed by id, plus runtime jobs and export runs. */
export const directorProgressSchema = z.object({
  needsRefresh: z.boolean(),
  takes: z.array(directorTakeSchema.partial().extend({ id: z.string() })).optional(),
  jobs: z.array(directorJobSchema).optional(),
  exports: z.array(directorExportSchema).optional(),
})
const commandBase = z.object({ projectId: z.string().uuid(), draftId: z.string().uuid(), sessionId: z.string().uuid(), idempotencyKey: z.string().uuid(), expectedRevision: z.number().int().nonnegative().optional() })
/** Shot ingredient references (continuity anchors, coverage keyframes) attached from the animatic view model. */
export const directorSourceReferenceSchema = z.object({ assetKey: z.string().min(1), label: z.string().max(200).default(''), kind: z.string().max(60).default('reference') })
export const directorSourceSchema = z.object({
  sequenceKey: z.string().optional(), requestId: z.string().optional(), shotId: z.string().optional(), sceneId: z.string().optional(),
  script: z.string().max(50000).default(''), legacyImported: z.boolean().optional(),
  /** Explicit image references from the shot's ingredients; the server validates project ownership and caps at nine images. */
  references: z.array(directorSourceReferenceSchema).max(12).optional(),
})
const sourceSchema = directorSourceSchema
export type DirectorSource = z.infer<typeof directorSourceSchema>
export type DirectorSourceReference = z.infer<typeof directorSourceReferenceSchema>
/** H3 accepts nine images: cast sheets first (identity), then shot ingredients in order until the cap. */
export function mergeDirectorImageReferences(cast: DirectorReference[], shot: DirectorReference[], limit = 9) {
  const seen = new Set<string>()
  const merged: DirectorReference[] = []
  for (const ref of [...cast, ...shot]) {
    if (seen.has(ref.assetKey) || merged.length >= limit) continue
    seen.add(ref.assetKey)
    merged.push(ref)
  }
  return merged
}
export const directorCommandSchema = z.discriminatedUnion('action', [
  commandBase.extend({ action: z.literal('create'), title: z.string().min(1).max(200), source: sourceSchema, entityKeys: z.array(z.string()).max(50).default([]), settings: directorSettingsSchema }),
  commandBase.extend({ action: z.literal('source'), source: sourceSchema }),
  commandBase.extend({ action: z.literal('direct'), direction: z.string().max(12000), entityKeys: z.array(z.string()).max(50), settings: directorSettingsSchema }),
  commandBase.extend({ action: z.literal('generate'), direction: z.string().max(12000).optional(), entityKeys: z.array(z.string()).max(50).optional(), settings: directorSettingsSchema.optional(), parentTakeId: z.string().uuid().optional(), branchSeconds: z.number().nonnegative().optional(), branchMode: z.enum(['frame', 'motion']).default('frame') }),
  commandBase.extend({ action: z.literal('live_start') }),
  commandBase.extend({ action: z.literal('live_finish'), takeId: z.string().uuid(), chunkCount: z.number().int().min(1).max(150) }),
  commandBase.extend({ action: z.literal('review'), takeId: z.string().uuid(), review: z.enum(['kept', 'rejected', 'candidate']) }),
  commandBase.extend({ action: z.literal('edit'), clips: z.array(directorClipSchema).max(500) }),
  commandBase.extend({ action: z.literal('restore_edit'), editId: z.string().uuid() }),
  commandBase.extend({ action: z.literal('cancel'), takeId: z.string().uuid() }),
  commandBase.extend({ action: z.literal('export') }),
])
export type DirectorSession = z.infer<typeof directorSessionSchema>
export type DirectorTake = z.infer<typeof directorTakeSchema>
export type DirectorEditRevision = z.infer<typeof directorEditSchema>
export type DirectorClip = z.infer<typeof directorClipSchema>
export type DirectorSettings = z.infer<typeof directorSettingsSchema>
export type DirectorContextSnapshot = z.infer<typeof directorContextSchema>
export type DirectorReference = z.infer<typeof directorReferenceSchema>
export type DirectorState = z.infer<typeof directorStateSchema>
export type DirectorProgress = z.infer<typeof directorProgressSchema>
export type DirectorJob = z.infer<typeof directorJobSchema>
export type DirectorExport = z.infer<typeof directorExportSchema>
export type DirectorCommand = z.infer<typeof directorCommandSchema>
export type DirectorResolution = DirectorSettings['resolution']

/** Output pixel height for a resolution setting; used by the export renderers. */
export function directorResolutionHeight(resolution: DirectorResolution) {
  return resolution === '1080p' ? 1080 : resolution === '768p' ? 768 : 480
}
/** Output frame size for an edit export. Adaptive ratio exports normalise to 16:9. */
export function directorExportFrame(settings: DirectorSettings) {
  const ratio = settings.aspectRatio === 'adaptive' ? '16:9' : settings.aspectRatio
  const [rw, rh] = ratio.split(':').map(Number)
  const height = directorResolutionHeight(settings.resolution)
  return { width: Math.round(height * rw / rh / 2) * 2, height }
}

/** Director assistant (LLM) contract shared by the client repository and the `director-assist` function. */
export const directorAssistRequestSchema = z.object({
  projectId: z.string().uuid(), draftId: z.string().uuid(), sessionId: z.string().uuid(),
  direction: z.string().max(12000).default(''),
  intent: z.enum(['polish', 'suggest']).default('polish'),
  entityKeys: z.array(z.string()).max(50).optional(),
  settings: directorSettingsSchema.optional(),
})
export const directorAssistResponseSchema = z.object({
  direction: z.string().default(''),
  notes: z.array(z.string()).max(6).default([]),
  messageId: z.string().nullable().default(null),
})
export type DirectorAssistRequest = z.infer<typeof directorAssistRequestSchema>
export type DirectorAssistResponse = z.infer<typeof directorAssistResponseSchema>

/** Prompt for a composed starting frame (image model) from the current scene, cast and direction. */
export function buildDirectorFramePrompt(input: {
  artDirection?: string
  script?: string
  direction: string
  cast: Array<{ name: string; visual: string }>
  aspectRatio: string
}) {
  const ratio = input.aspectRatio === 'adaptive' ? '16:9' : input.aspectRatio
  return [
    `One cinematic still frame in ${ratio}; the opening image of a film take.`,
    input.artDirection && `Art direction: ${input.artDirection}`,
    ...input.cast.filter(c => c.visual).map(c => `${c.name}: ${c.visual}`),
    input.script && `Scene: ${input.script.slice(0, 1500)}`,
    `Moment to show: ${input.direction}`,
    'Attached images are identity references for the named characters, places and props; match them exactly.',
    'Photographic staging, motivated lighting, clear composition. No text, captions, borders, panels, reference-sheet layouts or collage.',
  ].filter(Boolean).join('\n')
}

/** Keep the prefix through this occurrence of a take, never unrelated later clips. */
export function branchPrefix(clips: DirectorClip[], takeId: string, seconds: number): DirectorClip[] {
  const index = clips.findIndex(c => c.takeId === takeId && seconds >= c.inSeconds && seconds <= c.outSeconds)
  if (index < 0) throw new Error('The branch point is not in the active edit. Keep this take first.')
  const clip = clips[index]
  return [...clips.slice(0, index), ...(seconds > clip.inSeconds ? [{ ...clip, outSeconds: seconds }] : [])]
}

export function validateDirectorEdit(clips: DirectorClip[], takes: DirectorTake[]) {
  if (new Set(clips.map(c => c.id)).size !== clips.length) throw new Error('Clip IDs must be unique.')
  for (const clip of clips) {
    directorClipSchema.parse(clip)
    const take = takes.find(t => t.id === clip.takeId)
    if (!take || take.status !== 'completed' || !take.asset_key) throw new Error('Only saved takes can be edited.')
    if (clip.outSeconds > (take.duration_seconds ?? 0) + 0.025) throw new Error('Clip extends beyond the saved take.')
  }
  return clips
}

export function compileDirectorPrompt(context: DirectorContextSnapshot, direction: string, settings: DirectorSettings) {
  const counts = { image: 0, video: 0, audio: 0 }
  const legend = context.references.map(ref => `${ref.kind[0].toUpperCase()}${ref.kind.slice(1)} ${++counts[ref.kind]}: ${ref.label}.`)
  return [
    `One cinematic take. ${settings.mode === 'scripted' ? 'Follow the scripted action and exact dialogue; do not invent extra lines.' : 'Explore this scene within the supplied world identities.'}`,
    context.artDirection && `Art direction: ${context.artDirection}`,
    ...legend,
    ...context.entities.map(e => `${e.name}: ${e.visual || e.summary}${e.voice ? ` Voice: ${e.voice}` : ''}`),
    context.script && `Scene: ${context.script}`,
    context.continuity && `Starting continuity: ${context.continuity}`,
    `Direction: ${direction}`,
    'Native audio: scripted dialogue and action-related sounds. No music, captions, reference-sheet labels or panel borders.',
  ].filter(Boolean).join('\n')
}
