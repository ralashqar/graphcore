import { compileDirectorPrompt, directorContextSchema, directorSettingsSchema, directorSourceSchema, mergeDirectorImageReferences } from '../../../src/domain/directorWorkspace.ts'
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
  const castAssetKeys = [...new Set(entityResult.data.map(e => text(record(e.metadata).referenceSheetAssetKey) || text(e.thumbnail_asset_key)).filter(Boolean))]
  // Shot ingredients (continuity anchors, coverage keyframes) attached from the animatic view model.
  const shotReferences = directorSourceSchema.safeParse(session.source)
  const shotRefs = shotReferences.success ? (shotReferences.data.references ?? []).filter(ref => !castAssetKeys.includes(ref.assetKey)) : []
  const assetKeys = [...castAssetKeys, ...shotRefs.map(ref => ref.assetKey)]
  if (keys.length && !castAssetKeys.length && !shotRefs.length && !settings.firstFrameAssetKey && !branch.parentTakeId) throw new HttpError(400, 'Prepare a reference image for the selected world entities or choose a starting frame.')
  if (settings.firstFrameAssetKey) assetKeys.push(settings.firstFrameAssetKey)
  if (settings.endFrameAssetKey) assetKeys.push(settings.endFrameAssetKey)
  const assets = await client.from('project_assets').select('key,name,metadata').eq('project_id', session.project_id).in('key', [...new Set(assetKeys)])
  if (assets.error) throw assets.error
  if (assets.data.length !== new Set(assetKeys).size) throw new HttpError(400, 'A selected reference image is missing from this project.')
  const toReference = (a: { key: string; name: string | null; metadata: unknown }, label?: string) => ({ assetKey: a.key, label: label || a.name || a.key, kind: 'image' as const, width: Number(record(a.metadata).width) || 2048, height: Number(record(a.metadata).height) || 2048 })
  const castReferences = assets.data.filter(a => castAssetKeys.includes(a.key)).map(a => toReference(a))
  const ingredientReferences = shotRefs.flatMap(ref => { const a = assets.data.find(x => x.key === ref.assetKey); return a ? [toReference(a, ref.label ? `${ref.label} (${ref.kind.replace(/_/g, ' ')}; setting or prop reference, not a character)` : undefined)] : [] })
  let references = mergeDirectorImageReferences(castReferences, ingredientReferences)
  if (settings.firstFrameAssetKey) { const frame = assets.data.find(a => a.key === settings.firstFrameAssetKey); if (frame && !references.some(r => r.assetKey === frame.key)) references.push(toReference(frame)) }
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
