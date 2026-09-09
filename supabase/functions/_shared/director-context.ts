import { compileDirectorPrompt, directorContextSchema, directorSettingsSchema } from '../../../src/domain/directorWorkspace.ts'
import { estimateH3Cost, h3Model, validateH3References } from '../../../src/domain/h3Video.ts'
import type { createAdminClient } from './auth.ts'
import { HttpError } from './http.ts'

type Client = ReturnType<typeof createAdminClient>
const record = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
const text = (v: unknown) => typeof v === 'string' ? v : ''

export async function prepareDirectorGeneration(client: Client, session: Record<string, unknown>, branch: { parentTakeId?: string; branchSeconds?: number; branchMode?: string }) {
  const settings = directorSettingsSchema.parse(session.settings)
  const keys = Array.isArray(session.entity_keys) ? session.entity_keys as string[] : []
  const [entityResult, draftResult] = await Promise.all([
    client.from('world_entities').select('key,name,summary,metadata,thumbnail_asset_key').eq('draft_id', session.draft_id).in('key', keys),
    client.from('project_drafts').select('metadata,updated_at').eq('id', session.draft_id).single(),
  ])
  if (entityResult.error) throw entityResult.error
  if (draftResult.error) throw draftResult.error
  if (entityResult.data.length !== keys.length) throw new HttpError(400, 'One or more selected world references no longer exist.')
  const entities = entityResult.data.map(e => {
    const metadata = record(e.metadata)
    return { key: e.key, name: e.name, summary: e.summary ?? '', visual: text(record(metadata.visual).description) || text(metadata.visualDescription), voice: typeof metadata.voice === 'string' ? metadata.voice : metadata.voice ? JSON.stringify(metadata.voice) : '' }
  })
  const assetKeys = [...new Set(entityResult.data.map(e => text(record(e.metadata).referenceSheetAssetKey) || text(e.thumbnail_asset_key)).filter(Boolean))]
  if (keys.length && !assetKeys.length && !settings.firstFrameAssetKey && !branch.parentTakeId) throw new HttpError(400, 'Prepare a reference image for the selected world entities or choose a starting frame.')
  if (settings.firstFrameAssetKey) assetKeys.push(settings.firstFrameAssetKey)
  if (settings.endFrameAssetKey) assetKeys.push(settings.endFrameAssetKey)
  const assets = await client.from('project_assets').select('key,name,metadata').eq('project_id', session.project_id).in('key', [...new Set(assetKeys)])
  if (assets.error) throw assets.error
  if (assets.data.length !== new Set(assetKeys).size) throw new HttpError(400, 'A selected reference image is missing from this project.')
  let references = assets.data.filter(a => a.key !== settings.endFrameAssetKey).map(a => ({ assetKey: a.key, label: a.name || a.key, kind: 'image' as const, width: Number(record(a.metadata).width) || 2048, height: Number(record(a.metadata).height) || 2048 }))
  if (settings.firstFrameAssetKey && branch.branchMode !== 'motion') references = references.filter(r => r.assetKey === settings.firstFrameAssetKey)
  if (branch.parentTakeId && branch.branchMode !== 'motion') references = [] // The worker extracts the actual first frame.
  const wiki = record(record(draftResult.data.metadata).worldWiki)
  const context = directorContextSchema.parse({
    revision: draftResult.data.updated_at, script: text(record(session.source).script), artDirection: text(wiki.artStyleDescription),
    entities, references, continuity: branch.parentTakeId ? `Continue from the selected saved take at ${branch.branchSeconds} seconds. Preserve the visible state and camera direction; do not repeat earlier action.` : '',
  })
  validateH3References(references)
  h3Model(settings, references, Boolean(branch.parentTakeId))
  if (branch.branchMode === 'motion' && settings.speed === 'turbo') throw new HttpError(400, 'Motion-reference continuation requires H3 Max.')
  const pricedReferences = branch.branchMode === 'motion' ? [...references, { assetKey: branch.parentTakeId!, label: 'Previous motion', kind: 'video' as const, durationSeconds: Math.min(3, branch.branchSeconds ?? 0) }] : references
  validateH3References(pricedReferences)
  const providerPrompt = compileDirectorPrompt(context, text(session.direction), settings)
  if (providerPrompt.length > 50000) throw new HttpError(400, 'This scene is too large for one take. Select a shot or a shorter screenplay section.')
  return { context, providerPrompt, estimatedCostUsd: estimateH3Cost(settings, pricedReferences) }
}
