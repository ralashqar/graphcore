import { z } from 'npm:zod@4'
import { createAdminClient } from '../_shared/auth.ts'
import { errorResponse, HttpError, json, maybeHandleOptions } from '../_shared/http.ts'
Deno.serve(async request => {
  const preflight = maybeHandleOptions(request); if (preflight) return preflight
  try {
    if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed')
    const { buildId } = z.object({ buildId: z.string().uuid() }).strict().parse(await request.json())
    const admin = createAdminClient('get-game-release')
    const published = await admin.from('game_workspaces').select('draft_id').eq('published_build_id', buildId).maybeSingle()
    if (!published.data) throw new HttpError(404, 'Published game not found')
    const build = await admin.from('game_builds').select('manifest').eq('id', buildId).eq('draft_id', published.data.draft_id).eq('status', 'accepted').single()
    if (!build.data || build.error) throw new HttpError(404, 'Published game not found')
    const assetUrls: Record<string, string> = {}
    for (const asset of build.data.manifest.assets) {
      const signed = await admin.storage.from('project-assets').createSignedUrl(asset.storagePath, 3600)
      if (signed.error) throw signed.error
      assetUrls[asset.recipeKey] = signed.data.signedUrl
    }
    return json({ manifest: build.data.manifest, assetUrls })
  } catch (error) { return errorResponse(error, 'Could not load game release') }
})
