import { motionRecipeSchema, rigProfileSchema, clipRevisionSchema, ANIMATION_VERSION } from '../../src/domain/game/v3/animation.ts'
import { kimodoRelease, sourceMotionSchema, RunpodTransport, validateKimodoConstraints } from '../../src/domain/game/v3/animationTransport.ts'
import { bytesHash, runTool } from './io.ts'
import { step } from './modules.ts'
import { hashGameValue } from '../../src/domain/game/compiler.ts'
import type { JobContext } from './main.ts'

export async function cancelAnimationJobs(admin: JobContext['admin']) {
  const jobs = await admin.from('game_jobs').select('id,checkpoint,input,provider_started').eq('status', 'cancelled').not('input->animation', 'is', null).is('checkpoint->animationCancelled', null).limit(20)
  if (jobs.error) throw jobs.error
  for (const job of jobs.data ?? []) {
    if (job.input.animation.import) {
      const saved = await admin.from('game_jobs').update({ checkpoint: { ...job.checkpoint, animationCancelled: true } }).eq('id', job.id).eq('status', 'cancelled')
      if (saved.error) throw saved.error
      continue
    }
    if (job.checkpoint.animationRequestId) {
      await new RunpodTransport(Deno.env.get('RUNPOD_GRAPHCORE') ?? '').cancel(job.input.animation.provider.cancel, job.checkpoint.animationRequestId)
    } else if (!job.provider_started) {
      const release = await admin.rpc('game_animation_update_setup', { p_id: job.id, p_status: 'released', p_actual_cents: 0, p_evidence: { reason: 'cancelled_before_submission' } })
      if (release.error) throw release.error
    }
    // Cancellation never releases a submitted/uncertain provider reservation.
    const saved = await admin.from('game_jobs').update({ checkpoint: { ...job.checkpoint, animationCancelled: true } }).eq('id', job.id).eq('status', 'cancelled')
    if (saved.error) throw saved.error
  }
}

export async function produceAnimation(ctx: JobContext) {
  const { job, admin } = ctx, input = job.input.animation
  const recipe = motionRecipeSchema.parse(input.recipe), rig = rigProfileSchema.parse(input.rig)
  const frozen = { recipe, rig, modelRevision: kimodoRelease.model, processingVersion: ANIMATION_VERSION, jobId: job.id }
  await step(ctx, 'animation.constraints', frozen, async () => {
    validateKimodoConstraints(recipe)
    if (recipe.rigRevision !== rig.revision || input.provider.modelRevision !== kimodoRelease.model || input.provider.processingVersion !== ANIMATION_VERSION) throw new Error('Animation snapshot is incompatible; resume with its frozen processing version')
    return { recipeHash: await hashGameValue(recipe) }
  })
  const base = `generated/game/${job.draft_id}/${job.id}`
  async function upload(path: string, bytes: Uint8Array, contentType: string) {
    const result = await admin.storage.from('project-assets').upload(path, bytes, { contentType, upsert: true })
    if (result.error) throw new Error('Animation artifact upload failed')
    return path
  }
  const sources = await step(ctx, 'animation.inference', frozen, async () => {
    if (Array.isArray(job.checkpoint.animationSources) && job.checkpoint.animationSources.length === recipe.candidates) {
      const saved = job.checkpoint.animationSources as string[]
      if (!saved.every((path, index) => path === `${base}/source-${index}.json`)) throw new Error('Invalid stored animation source checkpoint')
      return saved
    }
    if (input.import) throw new Error('Imported source checkpoint is missing; inference is prohibited')
    const transport = new RunpodTransport(Deno.env.get('RUNPOD_GRAPHCORE') ?? '')
    if (!job.checkpoint.animationRequestId) {
      if (job.checkpoint.pendingProvider) throw new Error('Uncertain animation submission requires reconciliation')
      // The fenced checkpoint commits before the one and only submission attempt.
      await ctx.checkpoint('animation.inference', { ...job.checkpoint, pendingProvider: true })
      const intent = await admin.rpc('game_animation_update_setup', { p_id: job.id, p_status: 'uncertain' })
      if (intent.error) throw intent.error
      const id = await transport.submit(input.provider.run, { version: 1, recipe, modelRevision: kimodoRelease.model })
      await ctx.checkpoint('animation.inference', { ...job.checkpoint, pendingProvider: false, animationRequestId: id, animationDeadline: Date.now() + 900000 })
      const ledger = await admin.rpc('game_animation_update_setup', { p_id: job.id, p_status: 'submitted', p_request_id: id })
      if (ledger.error) throw ledger.error
    }
    while (Date.now() < job.checkpoint.animationDeadline) {
      await ctx.checkpoint('animation.inference', job.checkpoint)
      const response = await transport.status(input.provider.status, job.checkpoint.animationRequestId)
      if (response.status === 'COMPLETED') {
        const candidates = response.output?.candidates
        if (!Array.isArray(candidates) || candidates.length !== recipe.candidates) throw new Error('Invalid animation candidate count')
        const paths: string[] = []
        for (const [index, candidate] of candidates.entries()) {
          const source = sourceMotionSchema.parse(candidate)
          if (source.frames.length !== Math.round(recipe.duration * 30)) throw new Error('Motion duration mismatch')
          paths.push(await upload(`${base}/source-${index}.json`, new TextEncoder().encode(JSON.stringify(source)), 'application/json'))
        }
        await ctx.checkpoint('animation.inference', { ...job.checkpoint, animationSources: paths, providerExecutionMs: response.executionTime ?? null })
        // Execution time alone is not a complete bill: keep the full reservation
        // until startup/idle charges have been reconciled against provider billing.
        return paths
      }
      if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(response.status)) throw new Error(`Animation inference ${response.status.toLowerCase()}`)
      await new Promise(r => setTimeout(r, 5000))
    }
    await transport.cancel(input.provider.cancel, job.checkpoint.animationRequestId)
    throw new Error('Animation inference deadline exceeded; reconcile the existing provider job')
  }, ['animation.constraints'])
  const candidates = []
  for (const [index, sourcePath] of sources.entries()) {
    const source = await admin.storage.from('project-assets').download(sourcePath)
    if (source.error) throw new Error('Stored motion is unavailable')
    const directory = await Deno.makeTempDir({ prefix: 'game-animation-' })
    try {
      const sourceBytes = new Uint8Array(await source.data.arrayBuffer())
      if (input.import && await bytesHash(sourceBytes) !== input.import.sourceHash) throw new Error('Imported source hash mismatch')
      sourceMotionSchema.parse(JSON.parse(new TextDecoder().decode(sourceBytes)))
      await Deno.writeFile(`${directory}/source.json`, sourceBytes)
      await Deno.writeTextFile(`${directory}/recipe.json`, JSON.stringify(recipe))
      await Deno.writeTextFile(`${directory}/rig.json`, JSON.stringify(rig))
      for (const [stageIndex, stage] of ['retarget', 'process', 'export', 'validate'].entries()) {
        const prior = stageIndex === 0 ? 'animation.inference' : `animation.${['retarget', 'process', 'export'][stageIndex - 1]}.${index}`
        // Every stage persists its output so a different machine can resume it.
        const artifact = await step(ctx, `animation.${stage}.${index}`, { ...frozen, sourcePath, stage }, async () => {
          await runTool(Deno.env.get('GAME_BLENDER_BINARY') ?? 'blender', ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', 'workers/game/animation/bake.py', '--', directory, stage], 180000)
          const file = stage === 'export' ? 'output.glb' : `${stage}.json`
          const bytes = await Deno.readFile(`${directory}/${file}`)
          return { path: await upload(`${base}/${index}/${file}`, bytes, stage === 'export' ? 'model/gltf-binary' : 'application/json'), file }
        }, [prior])
        const saved = await admin.storage.from('project-assets').download(artifact.path)
        if (saved.error) throw new Error('Animation stage checkpoint is missing')
        await Deno.writeFile(`${directory}/${artifact.file}`, new Uint8Array(await saved.data.arrayBuffer()))
      }
      const validation = JSON.parse(await Deno.readTextFile(`${directory}/validate.json`))
      const processed = JSON.parse(await Deno.readTextFile(`${directory}/process.json`))
      const id = crypto.randomUUID()
      const clip = validation.accepted ? clipRevisionSchema.parse({
        version: 1, id, recipeHash: await hashGameValue(recipe), rigRevision: rig.revision,
        sourceHash: await bytesHash(sourceBytes), glbHash: await bytesHash(await Deno.readFile(`${directory}/output.glb`)), storagePath: `${base}/${index}/output.glb`,
        state: recipe.state, duration: processed.duration, fps: 30, loop: recipe.loop, naturalSpeed: processed.naturalSpeed,
        rootMode: recipe.rootMode, rootCurve: processed.rootCurve, contacts: processed.contacts, validation: { policy: ANIMATION_VERSION, accepted: true, metrics: validation.metrics },
      }) : null
      candidates.push({ id, index, sourcePath, clip, diagnostics: validation })
    } finally { await Deno.remove(directory, { recursive: true }) }
  }
  await ctx.checkpoint('animation.register', { ...job.checkpoint, animationCandidates: candidates })
  const result = await admin.rpc('game_animation_register', { p_job: job.id, p_worker: job.lease_owner, p_fence: job.fence, p_candidates: candidates })
  if (result.error || !result.data) throw new Error('Animation registration lost its lease')
}
