import { assetRecipeSchema, artifactSchema } from '../../src/domain/game/contracts.ts'
import { gameNodeHashes } from '../../src/domain/game/compiler.ts'
import { runTrackedOpenAiImages, recordAiUsageEvent } from '../../supabase/functions/_shared/ai-provider-gateway.ts'
import { buildFalMediaUsageLine } from '../../src/domain/aiUsage.ts'
import { bytesHash, downloadBounded, runTool } from './io.ts'
import type { JobContext } from './main.ts'
import { usageClient } from './usage.ts'

export async function produceAsset(ctx: JobContext) {
  const { job, admin } = ctx, design = job.input.design
  const recipe = assetRecipeSchema.parse(design.assets.find((a: { key: string }) => a.key === job.input.recipeKey))
  const basePath = `generated/game/${job.draft_id}/${job.id}`, sourceHash = (await gameNodeHashes(design))[`asset.${recipe.key}`]
  if (job.checkpoint.artifact) return { artifact: artifactSchema.parse(job.checkpoint.artifact) }
  const context = { projectId: job.input.projectId, draftId: job.draft_id, userId: job.requested_by, surface: 'game_asset', idempotencyKey: `${job.id}:reference` }
  if (recipe.method === 'image_to_3d' && !job.checkpoint.referencePath) {
    if (recipe.sourceImageAssetKey) {
      const source = await admin.from('project_assets').select('storage_path').eq('project_id', job.input.projectId).eq('key', recipe.sourceImageAssetKey).single()
      if (source.error || !source.data) throw new Error('Source image not found in this project')
      await ctx.checkpoint('mesh', { referencePath: source.data.storage_path, pendingProvider: false })
    } else {
      await ctx.checkpoint('reference', { pendingProvider: true })
      const result = await runTrackedOpenAiImages({ client: usageClient(admin), context, payload: { model: 'gpt-image-2', prompt: `${design.style.description}\n${recipe.prompt}\nOne isolated subject. Full shape visible. Plain neutral background, no text, labels, panels, collage, border, or cast shadow.`, size: '1024x1024', quality: 'medium', outputFormat: 'webp', n: 1, timeoutMs: 180000 } })
      if (!result.response.ok) {
        const message = (result.body.error as { message?: string } | undefined)?.message ?? 'Image provider rejected the request'
        await ctx.checkpoint('reference', { ...job.checkpoint, pendingProvider: false, providerFailure: { status: result.response.status, requestId: result.response.headers.get('x-request-id'), message: message.slice(0, 1500) } })
        throw new Error(`Reference generation failed (${result.response.status}): ${message.slice(0, 1500)}`)
      }
      const image = (result.body.data as Array<{ b64_json?: string }> | undefined)?.[0]?.b64_json
      if (!image) throw new Error('Reference provider did not return image bytes')
      const bytes = Uint8Array.from(atob(image), c => c.charCodeAt(0))
      if (bytes.length > 16000000) throw new Error('Reference exceeds image budget')
      const path = `${basePath}/reference.webp`, upload = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'image/webp', upsert: true })
      if (upload.error) throw upload.error
      await ctx.checkpoint('mesh', { referencePath: path, pendingProvider: false })
    }
  }
  let modelUrl: string | null = null
  if (recipe.method === 'image_to_3d') {
    const falKey = Deno.env.get('FAL_KEY'); if (!falKey) throw new Error('FAL_KEY is not configured')
    const headers = { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' }, base = 'https://queue.fal.run/fal-ai/trellis-2'
    if (!job.checkpoint.requestId) {
      const signed = await admin.storage.from('project-assets').createSignedUrl(job.checkpoint.referencePath, 3600)
      if (signed.error) throw signed.error
      await ctx.checkpoint('mesh', { ...job.checkpoint, pendingProvider: true })
      const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify({ image_url: signed.data.signedUrl, resolution: '512', decimation_target: recipe.maxTriangles, texture_size: 1024 }), signal: AbortSignal.timeout(45000) })
      if (!response.ok) throw new Error(`Mesh submission failed (${response.status})`)
      const submitted = await response.json()
      if (typeof submitted.request_id !== 'string') throw new Error('Mesh request ID missing')
      await ctx.checkpoint('mesh', { ...job.checkpoint, requestId: submitted.request_id, submittedAt: Date.now(), pendingProvider: false })
    }
    const id = encodeURIComponent(job.checkpoint.requestId), deadline = Number(job.checkpoint.pollingDeadlineAt ?? (Number(job.checkpoint.submittedAt) + 1800000))
    while (Date.now() < deadline) {
      await ctx.checkpoint('mesh', job.checkpoint)
      const status = await fetch(`${base}/requests/${id}/status`, { headers, signal: AbortSignal.timeout(30000) })
      if ([408, 429, 500, 502, 503, 504].includes(status.status)) { await new Promise(r => setTimeout(r, 10000)); continue }
      if (!status.ok) throw new Error(`Mesh polling failed (${status.status})`)
      const data = await status.json()
      if (data.status === 'COMPLETED') {
        const response = await fetch(`${base}/requests/${id}`, { headers, signal: AbortSignal.timeout(30000) })
        if (!response.ok) throw new Error(`Mesh result failed (${response.status})`)
        modelUrl = (await response.json()).model_glb?.url
        if (!modelUrl) throw new Error('Mesh result has no GLB')
        break
      }
      if (['FAILED', 'CANCELLED'].includes(data.status)) throw new Error(`Mesh provider ${data.status.toLowerCase()}`)
      await new Promise(r => setTimeout(r, 10000))
    }
    if (!modelUrl) throw new Error('Mesh provider deadline exceeded; recover the existing request')
    const usage = buildFalMediaUsageLine({ model: 'fal-ai/trellis-2', modality: 'image', operation: 'provider_queue', requestId: job.checkpoint.requestId, nodeKey: recipe.key, nodeLabel: recipe.subject, metadata: { assetModality: 'mesh', pricingPolicy: 'trellis_512' } })
    usage.cost.estimatedCostUsd = .25; usage.cost.actualCostUsd = 0; usage.cost.pricingSource = 'game_trellis_512_snapshot'
    usage.metadata = { ...usage.metadata, invoiceReconciled: false }
    await recordAiUsageEvent(usageClient(admin), { line: usage, context: { ...context, idempotencyKey: `${job.id}:mesh` }, idempotencyKey: `${job.id}:mesh`, creditsCharged: 0 })
  }
  const temporary = await Deno.makeTempDir({ prefix: 'graphcore-game-asset-' })
  try {
    await ctx.checkpoint('prepare', { ...job.checkpoint, pendingProvider: false })
    if (modelUrl) {
      await Deno.writeFile(`${temporary}/input.glb`, await downloadBounded(modelUrl, 64000000))
      await runTool(Deno.env.get('GAME_NODE_BINARY') ?? 'node', ['scripts/game-validate-glb.mjs', `${temporary}/input.glb`, `${temporary}/input-validation.json`, '--repairable'], 60000)
    }
    await Deno.writeTextFile(`${temporary}/recipe.json`, JSON.stringify({ ...recipe, color: design.style.accent }))
    await runTool(Deno.env.get('GAME_BLENDER_BINARY') ?? 'blender', ['--background', '--factory-startup', '--disable-autoexec', '--python-exit-code', '1', '--python', recipe.method === 'approved_rig' ? 'workers/game/template_rig.py' : 'workers/game/prepare_asset.py', '--', temporary], 180000)
    await ctx.checkpoint('validate', job.checkpoint)
    await runTool(Deno.env.get('GAME_NODE_BINARY') ?? 'node', ['scripts/game-validate-glb.mjs', `${temporary}/output.glb`, `${temporary}/validation.json`], 60000)
    const validation = JSON.parse(await Deno.readTextFile(`${temporary}/validation.json`)), metrics = JSON.parse(await Deno.readTextFile(`${temporary}/metrics.json`)), bytes = await Deno.readFile(`${temporary}/output.glb`)
    if (validation.issues.numErrors > 0 || metrics.triangles > recipe.maxTriangles || bytes.length > recipe.maxBytes) throw new Error('Prepared mesh failed geometry or size acceptance')
    const digest = await bytesHash(bytes), path = `${basePath}/${digest}.glb`, upload = await admin.storage.from('project-assets').upload(path, bytes, { contentType: 'model/gltf-binary', upsert: true })
    if (upload.error) throw upload.error
    const colliderPath = `${basePath}/${digest}.collider.json`
    const collider = await admin.storage.from('project-assets').upload(colliderPath, new TextEncoder().encode(JSON.stringify({ type: 'box', dimensions: metrics.dimensions })), { contentType: 'application/json', upsert: true })
    if (collider.error) throw collider.error
    const artifact = artifactSchema.parse({ recipeKey: recipe.key, revisionId: job.id, sourceHash, storagePath: path, sha256: digest, bytes: bytes.length, triangles: metrics.triangles, dimensions: metrics.dimensions, reports: ['GLB validated', 'Normalized transforms and scale', 'Triangle and byte budgets passed', `Collision proxy: ${colliderPath}`] })
    await ctx.checkpoint('register', { ...job.checkpoint, artifact })
    return { artifact }
  } finally { await Deno.remove(temporary, { recursive: true }) }
}
