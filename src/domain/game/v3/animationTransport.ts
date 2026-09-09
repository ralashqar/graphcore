import { z } from 'zod'
import { KIMODO_MODEL, motionRecipeSchema, motionbricksProvenanceSchema } from './animation.ts'
import { MOTIONBRICKS_MODEL, motionbricksRelease } from './motionbricksRelease.ts'
import { g1Skeleton } from './g1Skeleton.ts'
import { somaSkeleton } from './somaSkeleton.ts'

export const kimodoRelease = Object.freeze({
  source: '1aece8c124d73d255ceff5086d983b844c9f4e94',
  model: '6c9233af1180b8151e3c4703477104af5dce9dd5',
  encoder: '31474e395ada192e8ed1586db6be79fb3b70c9c0',
  adapter: 'baa8ebf04a1c2500e61288e7dad65e8ae42601a7',
  baseEncoder: '8afb486c1db24fe5011ec46dfbe5b5dccdb575c2',
})
const scalar = z.number().finite()
const vector = z.tuple([scalar, scalar, scalar])
const quaternion = z.tuple([scalar, scalar, scalar, scalar]).refine(q => Math.abs(Math.hypot(...q) - 1) < .002)
const motionFields = {
  fps: z.literal(30), seed: z.number().int().nonnegative(),
  joints: z.array(z.object({ name: z.string().min(1).max(100), parent: z.number().int().min(-1), rest: vector }).strict()).min(15).max(100),
  frames: z.array(z.object({ root: vector, rotations: z.array(quaternion).min(15).max(100) }).strict()).min(15).max(240),
}
export const sourceMotionSchema = z.discriminatedUnion('version', [
  z.object({ ...motionFields, version: z.literal(1), model: z.literal(KIMODO_MODEL), modelRevision: z.literal(kimodoRelease.model) }).strict(),
  z.object({ ...motionFields, version: z.literal(2), model: z.literal(MOTIONBRICKS_MODEL), modelRevision: z.literal(motionbricksRelease.model),
    provenance: motionbricksProvenanceSchema, space: z.enum(['g1', 'soma']), restRotations: z.array(quaternion).min(15).max(100),
  }).strict(),
]).superRefine((motion, ctx) => {
  if (motion.version === 2 && (motion.restRotations.length !== motion.joints.length || motion.joints.length !== (motion.space === 'g1' ? 34 : 77))) ctx.addIssue({ code: 'custom', message: 'MotionBricks skeleton does not match its declared space' })
  if (motion.version === 2) {
    const expected = motion.space === 'g1' ? g1Skeleton : somaSkeleton.joints
    if (motion.joints.some((j,i)=>j.name!==expected[i]?.name || j.parent!==expected[i]?.parent)) ctx.addIssue({ code:'custom', message:'MotionBricks skeleton topology mismatch' })
    if (motion.joints.some((j,i)=>j.rest.some((v,k)=>Math.abs(v-(expected[i]?.rest[k]??Infinity))>1e-5))) ctx.addIssue({ code:'custom', message:'MotionBricks rest proportions differ from the pinned skeleton' })
  }
  const names = new Set<string>()
  motion.joints.forEach((j, i) => {
    if (names.has(j.name) || (i === 0 ? j.parent !== -1 : j.parent < 0 || j.parent >= i)) ctx.addIssue({ code: 'custom', message: 'Invalid source skeleton' })
    names.add(j.name)
  })
  if (motion.frames.some(f => f.rotations.length !== motion.joints.length)) ctx.addIssue({ code: 'custom', message: 'Source joint count mismatch' })
})
export type SourceMotion = z.infer<typeof sourceMotionSchema>

export function validateKimodoConstraints(recipe: z.infer<typeof motionRecipeSchema>) {
  const frames = Math.round(recipe.duration * 30)
  for (const points of [recipe.path, recipe.poses]) {
    const indices = points.map(p => Math.min(frames - 1, Math.round(p.time * 30)))
    if (new Set(indices).size !== indices.length) throw new Error('Constraint times collide at 30 fps')
  }
  const effectors = { left_hand: 'LeftHand', right_hand: 'RightHand', left_foot: 'LeftFoot', right_foot: 'RightFoot' }
  const allowed = new Set(['Hips', 'LeftLeg', 'RightLeg', ...Object.values(effectors)])
  for (const pose of recipe.poses) {
    if (!['Hips', 'LeftLeg', 'RightLeg'].every(j => j in pose.joints) || !Object.values(effectors).some(j => j in pose.joints)) throw new Error('Milestones require pelvis, hips and an end effector')
    if (Object.keys(pose.joints).some(j => !allowed.has(j))) throw new Error('This model adapter supports pelvis/hip and end-effector milestones only')
  }
  for (const contact of recipe.contacts) for (const time of [contact.start, contact.end]) {
    if (!recipe.poses.some(p => Math.abs(p.time-time) < 1/60 && JSON.stringify(p.joints[effectors[contact.effector]]) === JSON.stringify(contact.position))) throw new Error('Contact boundaries require matching milestone poses')
  }
}

export const inferenceRequestSchema = z.object({
  version: z.literal(1), recipe: motionRecipeSchema, modelRevision: z.literal(kimodoRelease.model),
}).strict().refine(r => r.recipe.version === 1, 'Kimodo only accepts legacy Kimodo recipes')
export const motionbricksRequestSchema = z.object({
  version: z.literal(2), recipe: motionRecipeSchema, modelRevision: z.literal(motionbricksRelease.model),
}).strict().refine(r => r.recipe.version === 2, 'MotionBricks requires a versioned G1 recipe')

// Server-only callers supply URLs copied from Runpod's endpoint requestUrls.
// Never accept a provider URL or credential from a browser command.
export function runpodUrl(value: string): URL {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.hostname !== 'api.runpod.ai' || url.username || url.password || url.search || url.hash || !/^\/v2\/[a-zA-Z0-9_-]+\/(run|status|cancel)(\/[a-zA-Z0-9_-]+)?$/.test(url.pathname)) throw new Error('Invalid Runpod runtime URL')
  return url
}

export class RunpodTransport {
  private readonly key: string
  private readonly request: typeof fetch
  constructor(key: string, request: typeof fetch = fetch) {
    if (!key) throw new Error('RUNPOD_GRAPHCORE is not configured')
    this.key = key; this.request = request
  }
  private async call(url: URL, body?: unknown) {
    const response = await this.request(url, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000),
    })
    // Provider bodies/errors can contain signed URLs. Keep them out of error logs.
    if (!response.ok) throw new Error(`Runpod request returned HTTP ${response.status}`)
    const reader = response.body?.getReader()
    if (!reader) throw new Error('Runpod returned no response body')
    let size = 0; const chunks: Uint8Array[] = []
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 16_000_000) throw new Error('Runpod result exceeds byte limit'); chunks.push(part.value) } }
    finally { await reader.cancel() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    return JSON.parse(new TextDecoder().decode(bytes))
  }
  async submit(url: string, input: z.infer<typeof inferenceRequestSchema> | z.infer<typeof motionbricksRequestSchema>) {
    const target = runpodUrl(url)
    if (!target.pathname.endsWith('/run')) throw new Error('Expected Runpod submission URL')
    // Deliberately no retry: caller must persist a submission marker first.
    const validated = input.version === 2 ? motionbricksRequestSchema.parse(input) : inferenceRequestSchema.parse(input)
    const data = await this.call(target, { input: validated, policy: { executionTimeout: 600000, lowPriority: false, ttl: 900000 } })
    return z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,150}$/) }).parse(data).id
  }
  async status(url: string, jobId: string) {
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(jobId)) throw new Error('Invalid provider job ID')
    const target = runpodUrl(`${url.replace(/\/$/, '')}/${jobId}`)
    if (!target.pathname.includes('/status/')) throw new Error('Expected Runpod status URL')
    return this.call(target)
  }
  async cancel(url: string, jobId: string) {
    if (!/^[a-zA-Z0-9_-]{1,150}$/.test(jobId)) throw new Error('Invalid provider job ID')
    const target = runpodUrl(`${url.replace(/\/$/, '')}/${jobId}`)
    if (!target.pathname.includes('/cancel/')) throw new Error('Expected Runpod cancellation URL')
    return this.call(target, {})
  }
}
