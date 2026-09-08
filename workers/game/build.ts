import { compileGame, affectedGameNodes } from '../../src/domain/game/compiler.ts'
import { runGameAcceptance } from '../../src/domain/game/simulation.ts'
import { artifactSchema } from '../../src/domain/game/contracts.ts'
import { downloadBounded, runTool, bytesHash } from './io.ts'
import type { JobContext } from './main.ts'

export async function buildGame(ctx: JobContext) {
  const { job, admin } = ctx
  const assets = (job.input.assets ?? []).map((value: unknown) => artifactSchema.parse(value))
  const manifest = await compileGame({ id: job.id, projectId: job.input.projectId, draftId: job.draft_id, sourceRevision: job.input.sourceRevision, design: job.input.design, assets })
  const previous = await admin.from('game_builds').select('manifest').eq('draft_id', job.draft_id).eq('status', 'accepted').order('created_at', { ascending: false }).limit(1).maybeSingle()
  const changed = affectedGameNodes(manifest.design, previous.data?.manifest.nodeHashes ?? {}, manifest.nodeHashes)
  await ctx.checkpoint('rules', { manifest, changed })
  const reports: Array<Record<string, unknown>> = runGameAcceptance(manifest)
  if (reports.some(r => !r.passed)) return { manifest, reports, accepted: false }
  const temporary = await Deno.makeTempDir({ prefix: 'graphcore-game-build-' })
  try {
    const assetUrls: Record<string, string> = {}
    for (const asset of manifest.assets) {
      const signed = await admin.storage.from('project-assets').createSignedUrl(asset.storagePath, 600)
      if (signed.error) throw signed.error
      const bytes = await downloadBounded(signed.data.signedUrl, asset.bytes + 1)
      if (await bytesHash(bytes) !== asset.sha256) throw new Error(`Asset hash mismatch: ${asset.recipeKey}`)
      const filename = `${asset.revisionId}.glb`
      await Deno.writeFile(`${temporary}/${filename}`, bytes); assetUrls[asset.recipeKey] = `/staged/${filename}`
    }
    await Deno.writeTextFile(`${temporary}/candidate.json`, JSON.stringify({ manifest, assetUrls }))
    await ctx.checkpoint('browser', { manifest, changed })
    let toolError: unknown
    try { await runTool(Deno.env.get('GAME_NODE_BINARY') ?? 'node', ['scripts/game-browser-acceptance.mjs', temporary], 180000) } catch (error) { toolError = error }
    if (toolError) {
      try { await Deno.stat(`${temporary}/report.json`) } catch { throw toolError }
    }
    const browser = JSON.parse(await Deno.readTextFile(`${temporary}/report.json`))
    reports.push(...browser.reports)
    const reportPath = `generated/game/${job.draft_id}/${job.id}/acceptance.json`
    const upload = await admin.storage.from('project-assets').upload(reportPath, new TextEncoder().encode(JSON.stringify({ changed, reports })), { contentType: 'application/json', upsert: true })
    if (upload.error) throw upload.error
    try {
      const screenshot = await Deno.readFile(`${temporary}/playthrough.png`)
      const image = await admin.storage.from('project-assets').upload(`generated/game/${job.draft_id}/${job.id}/playthrough.png`, screenshot, { contentType: 'image/png', upsert: true })
      if (image.error) throw image.error
    } catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error }
    await ctx.checkpoint('register', { manifest, changed, reports })
    return { manifest, reports, accepted: reports.every(r => r.passed === true) }
  } finally { await Deno.remove(temporary, { recursive: true }) }
}
